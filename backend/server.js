import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { QUESTIONS } from './questions.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const MAX_PLAYERS = 50;
const QUESTION_TIMEOUT_SECONDS = 25;

// In-memory rooms storage
const rooms = new Map();

function getPublicRoomState(room) {
  if (!room) return null;
  
  const questionCount = room.mode === 'express' ? 5 : 10;
  const currentQ = room.questions[room.currentQuestionIndex];
  const activeConnectedCount = room.players.filter(p => !p.disconnected).length;
  
  return {
    roomId: room.roomId,
    mode: room.mode,
    language: room.language,
    status: room.status, // 'lobby' | 'question' | 'feedback' | 'leaderboard'
    playerCount: activeConnectedCount,
    maxPlayers: MAX_PLAYERS,
    emptyRoomTimerSeconds: room.emptyRoomTimerSeconds || 0,
    isEmptyRoomGrace: !!room.emptyRoomTimerInterval,
    players: room.players.map(p => ({
      id: p.id,
      playerKey: p.playerKey,
      nickname: p.nickname,
      score: p.score,
      answered: p.answered,
      lastAnswerCorrect: p.lastAnswerCorrect,
      lastPointsEarned: p.lastPointsEarned,
      disconnected: p.disconnected
    })),
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: questionCount,
    timerSeconds: room.timerSeconds,
    maxQuestionTimerSeconds: QUESTION_TIMEOUT_SECONDS,
    feedbackTimerSeconds: room.feedbackTimerSeconds || 0,
    answersReceivedCount: room.players.filter(p => p.answered && !p.disconnected).length,
    currentQuestion: currentQ ? {
      id: currentQ.id,
      questionText: (room.language && currentQ.question[room.language.toLowerCase()]) || currentQ.question.de || '',
      options: (room.language && currentQ.options[room.language.toLowerCase()]) || currentQ.options.de || [],
      correctAnswerIndex: room.status === 'feedback' || room.status === 'leaderboard' ? currentQ.correctAnswerIndex : null
    } : null
  };
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room_state', getPublicRoomState(room));
}

function startEmptyRoomTimer(room) {
  if (room.emptyRoomTimerInterval) return; // Already running

  console.log(`All players disconnected in room ${room.roomId}. Pausing game and starting 30s grace timer...`);
  
  // Pause active question and feedback timers
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  if (room.feedbackTimerInterval) {
    clearInterval(room.feedbackTimerInterval);
    room.feedbackTimerInterval = null;
  }

  room.isPaused = true;
  room.emptyRoomTimerSeconds = 30;
  broadcastRoomState(room.roomId);

  room.emptyRoomTimerInterval = setInterval(() => {
    room.emptyRoomTimerSeconds -= 1;
    if (room.emptyRoomTimerSeconds <= 0) {
      clearInterval(room.emptyRoomTimerInterval);
      room.emptyRoomTimerInterval = null;
      console.log(`30s grace timer expired for room ${room.roomId}. Auto-resetting room to Title Slide...`);
      
      resetRoomToTitle(room);
    } else {
      broadcastRoomState(room.roomId);
    }
  }, 1000);
}

function cancelEmptyRoomTimer(room) {
  if (room.emptyRoomTimerInterval) {
    clearInterval(room.emptyRoomTimerInterval);
    room.emptyRoomTimerInterval = null;
    room.emptyRoomTimerSeconds = 0;
    console.log(`Player rejoined room ${room.roomId}. Resuming game...`);
  }

  if (room.isPaused) {
    room.isPaused = false;
    if (room.status === 'question') {
      startQuestionTimer(room);
    } else if (room.status === 'feedback') {
      startFeedbackTimer(room);
    }
  }
}

function resetRoomToTitle(room) {
  if (room.timerInterval) clearInterval(room.timerInterval);
  if (room.feedbackTimerInterval) clearInterval(room.feedbackTimerInterval);
  if (room.emptyRoomTimerInterval) clearInterval(room.emptyRoomTimerInterval);

  io.to(room.roomId).emit('room_reset');

  room.status = 'title';
  room.players = [];
  room.currentQuestionIndex = 0;
  room.timerSeconds = QUESTION_TIMEOUT_SECONDS;
  room.emptyRoomTimerSeconds = 0;
  room.isPaused = false;

  broadcastRoomState(room.roomId);
  rooms.delete(room.roomId);
}

function startFeedbackTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  if (room.feedbackTimerInterval) {
    clearInterval(room.feedbackTimerInterval);
    room.feedbackTimerInterval = null;
  }

  const totalQuestions = room.mode === 'express' ? 5 : 10;
  
  room.status = 'feedback';
  room.feedbackTimerSeconds = 8;
  broadcastRoomState(room.roomId);

  room.feedbackTimerInterval = setInterval(() => {
    room.feedbackTimerSeconds -= 1;
    if (room.feedbackTimerSeconds <= 0) {
      clearInterval(room.feedbackTimerInterval);
      room.feedbackTimerInterval = null;
      advanceToNextQuestion(room);
    } else {
      broadcastRoomState(room.roomId);
    }
  }, 1000);
}

function handleTimerExpired(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'question') return;
  startFeedbackTimer(room);
}

function checkAllAnswersSubmitted(room) {
  const activePlayers = room.players.filter(p => !p.disconnected);
  const allAnswered = activePlayers.length > 0 && activePlayers.every(p => p.answered);

  if (allAnswered) {
    startFeedbackTimer(room);
  }
}

function startQuestionTimer(room) {
  if (room.timerInterval) clearInterval(room.timerInterval);
  if (room.feedbackTimerInterval) clearInterval(room.feedbackTimerInterval);
  
  room.timerSeconds = QUESTION_TIMEOUT_SECONDS;
  room.questionStartTime = Date.now();
  
  room.timerInterval = setInterval(() => {
    room.timerSeconds -= 1;
    if (room.timerSeconds <= 0) {
      handleTimerExpired(room.roomId);
    } else {
      broadcastRoomState(room.roomId);
    }
  }, 1000);
}

function advanceToNextQuestion(room) {
  if (room.timerInterval) clearInterval(room.timerInterval);
  if (room.feedbackTimerInterval) clearInterval(room.feedbackTimerInterval);

  const totalQuestions = room.mode === 'express' ? 5 : 10;
  if (room.currentQuestionIndex + 1 < totalQuestions) {
    room.currentQuestionIndex += 1;
    room.status = 'question';
    room.players.forEach(p => {
      p.answered = false;
      p.lastAnswerCorrect = null;
      p.lastPointsEarned = 0;
    });
    startQuestionTimer(room);
  } else {
    room.status = 'leaderboard';
  }
  broadcastRoomState(room.roomId);
}

// Fisher-Yates Shuffle for true uniform distribution
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper to sanitize player nickname
function sanitizeNickname(rawNickname, fallbackIndex) {
  if (!rawNickname || typeof rawNickname !== 'string') {
    return `Player_${fallbackIndex}`;
  }
  const cleaned = rawNickname
    .trim()
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, '')
    .substring(0, 15);
  return cleaned || `Player_${fallbackIndex}`;
}

const safeCallback = (cb, data) => {
  if (typeof cb === 'function') cb(data);
};

// Periodic cleanup of stale/abandoned rooms (inactive > 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    const lastActive = room.lastActivity || room.createdAt || now;
    if (now - lastActive > 3600000) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.feedbackTimerInterval) clearInterval(room.feedbackTimerInterval);
      if (room.emptyRoomTimerInterval) clearInterval(room.emptyRoomTimerInterval);
      rooms.delete(roomId);
      console.log(`Cleaned up abandoned room ${roomId}`);
    }
  }
}, 60000);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create room (Host action)
  socket.on('create_room', ({ roomId, mode = 'standard', language = 'DE', hostKey }, callback) => {
    const code = roomId || `ROOM_${Math.floor(1000 + Math.random() * 9000)}`;
    const effectiveHostKey = hostKey || `HOST_${Math.random().toString(36).substring(2, 11)}`;
    
    // Select shuffled questions using Fisher-Yates
    const shuffledQuestions = shuffleArray(QUESTIONS);
    
    const newRoom = {
      roomId: code,
      hostSocketId: socket.id,
      hostKey: effectiveHostKey,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      mode, // 'standard' (10) or 'express' (5)
      language: language || 'DE', // 'DE' or 'EN'
      status: 'lobby',
      players: [],
      questions: shuffledQuestions,
      currentQuestionIndex: 0,
      timerSeconds: QUESTION_TIMEOUT_SECONDS,
      timerInterval: null,
      feedbackTimerInterval: null,
      emptyRoomTimerInterval: null,
      emptyRoomTimerSeconds: 0,
      questionStartTime: null
    };

    rooms.set(code, newRoom);
    socket.join(code);
    socket.roomId = code;
    socket.isHost = true;

    console.log(`Room created: ${code} with hostKey: ${effectiveHostKey}`);
    safeCallback(callback, { success: true, roomId: code, hostKey: effectiveHostKey, state: getPublicRoomState(newRoom) });
    broadcastRoomState(code);
  });

  // Get Room Info (Mobile pre-join language lookup)
  socket.on('get_room_info', ({ roomId }, callback) => {
    if (!roomId) return safeCallback(callback, { success: false, error: 'INVALID_ROOM' });
    const room = rooms.get(roomId);
    if (!room) {
      safeCallback(callback, { success: false, error: 'ROOM_NOT_FOUND' });
      return;
    }
    room.lastActivity = Date.now();
    safeCallback(callback, { success: true, language: room.language, mode: room.mode, status: room.status });
  });

  // Join room (Mobile action)
  socket.on('join_room', ({ roomId, nickname, playerKey }, callback) => {
    if (!roomId) return safeCallback(callback, { success: false, error: 'INVALID_ROOM' });
    const room = rooms.get(roomId);
    
    if (!room) {
      return safeCallback(callback, { success: false, error: 'ROOM_NOT_FOUND', message: 'RAUM NICHT GEFUNDEN / ROOM NOT FOUND' });
    }

    room.lastActivity = Date.now();
    const key = playerKey || `PK_${Math.random().toString(36).substring(2, 9)}`;

    // OPTION A: Check if player is rejoining after refresh (by playerKey OR nickname)
    let player = room.players.find(p => 
      (key && p.playerKey === key) || 
      (nickname && p.nickname.toLowerCase() === String(nickname).trim().toLowerCase())
    );
    
    if (player && room.status !== 'title') {
      player.id = socket.id;
      player.disconnected = false;
      if (key) player.playerKey = key;
      cancelEmptyRoomTimer(room);

      socket.join(roomId);
      socket.roomId = roomId;
      socket.isHost = false;

      console.log(`Player ${player.nickname} REJOINED room ${roomId}`);
      safeCallback(callback, { success: true, player, playerKey: player.playerKey || key, rejoined: true, state: getPublicRoomState(room) });
      broadcastRoomState(roomId);
      return;
    }

    if (room.status !== 'lobby') {
      return safeCallback(callback, { success: false, error: 'GAME_IN_PROGRESS', message: 'RUNDE LÄUFT BEREITS / GAME IN PROGRESS' });
    }

    const activePlayers = room.players.filter(p => !p.disconnected);
    if (activePlayers.length >= MAX_PLAYERS) {
      return safeCallback(callback, { success: false, error: 'ROOM_FULL', message: 'RAUM IST VOLL (MAX 50 SPIELER)' });
    }

    const cleanedNickname = sanitizeNickname(nickname, activePlayers.length + 1);

    player = {
      id: socket.id,
      playerKey: key,
      nickname: cleanedNickname,
      score: 0,
      answered: false,
      lastAnswerCorrect: null,
      lastPointsEarned: 0,
      disconnected: false
    };
    room.players.push(player);
    cancelEmptyRoomTimer(room);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.isHost = false;

    console.log(`Player ${player.nickname} joined room ${roomId}`);
    safeCallback(callback, { success: true, player, playerKey: key, rejoined: false, state: getPublicRoomState(room) });
    broadcastRoomState(roomId);
  });

  // Leave room (Mobile lobby action)
  socket.on('leave_room', ({ roomId }) => {
    const targetRoomId = roomId || socket.roomId;
    if (!targetRoomId) return;

    const room = rooms.get(targetRoomId);
    if (!room) return;

    room.lastActivity = Date.now();
    console.log(`Player on socket ${socket.id} left room ${targetRoomId}`);
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(targetRoomId);
    socket.roomId = null;

    broadcastRoomState(targetRoomId);
  });

  // Host starts quiz
  socket.on('start_quiz', ({ roomId, hostKey }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'lobby') return;

    const isHostAuthorized = socket.id === room.hostSocketId || (hostKey && hostKey === room.hostKey);
    if (!isHostAuthorized) {
      console.warn(`Unauthorized start_quiz attempt from socket ${socket.id} on room ${roomId}`);
      return;
    }
    // Update socket ID if reconnected host
    room.hostSocketId = socket.id;
    room.lastActivity = Date.now();

    room.status = 'question';
    room.currentQuestionIndex = 0;
    room.players.forEach(p => {
      p.answered = false;
      p.lastAnswerCorrect = null;
      p.lastPointsEarned = 0;
    });

    startQuestionTimer(room);
    broadcastRoomState(roomId);
  });

  // Submit or change answer (Mobile action)
  // Allowed anytime while room.status === 'question' before the phase ends
  socket.on('submit_answer', ({ roomId, optionIndex }, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'question') {
      safeCallback(callback, { success: false, error: 'NOT_IN_QUESTION_PHASE' });
      return;
    }

    room.lastActivity = Date.now();
    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      safeCallback(callback, { success: false, error: 'PLAYER_NOT_FOUND' });
      return;
    }

    const currentQ = room.questions[room.currentQuestionIndex];
    if (!currentQ || !currentQ.options) {
      safeCallback(callback, { success: false, error: 'INVALID_QUESTION_STATE' });
      return;
    }

    const availableOptionsCount = (currentQ.options.de || currentQ.options.en || []).length;
    if (typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= availableOptionsCount) {
      safeCallback(callback, { success: false, error: 'INVALID_OPTION_INDEX' });
      return;
    }

    const startTime = room.questionStartTime || Date.now();
    const secondsTaken = Math.max(0, (Date.now() - startTime) / 1000);
    const isCorrect = optionIndex === currentQ.correctAnswerIndex;

    // If player already submitted an answer for this question and received points, revert previous points first
    if (player.answered && (player.lastPointsEarned || 0) > 0) {
      player.score = Math.max(0, player.score - player.lastPointsEarned);
      player.lastPointsEarned = 0;
    }

    player.answered = true;
    player.lastAnswerCorrect = isCorrect;

    if (isCorrect) {
      // Base: 50 points + speed bonus up to 50 points based on time elapsed when choosing this answer
      const speedBonus = Math.max(0, Math.round(50 * (1 - (secondsTaken / QUESTION_TIMEOUT_SECONDS))));
      const points = 50 + speedBonus;
      player.lastPointsEarned = points;
      player.score += points;
    } else {
      player.lastPointsEarned = 0;
    }

    safeCallback(callback, { success: true, isCorrect, pointsEarned: player.lastPointsEarned, optionIndex });

    // Update real-time count on host and mobile
    broadcastRoomState(roomId);

    // Check if all connected players submitted
    checkAllAnswersSubmitted(room);
  });

  // Next question or view leaderboard (Host action or Auto-advance)
  socket.on('next_question', ({ roomId, hostKey }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const isHostAuthorized = socket.id === room.hostSocketId || (hostKey && hostKey === room.hostKey);
    if (!isHostAuthorized) {
      console.warn(`Unauthorized next_question attempt from socket ${socket.id} on room ${roomId}`);
      return;
    }
    room.hostSocketId = socket.id;
    room.lastActivity = Date.now();

    advanceToNextQuestion(room);
  });

  // Admin Hostess Quick Reset
  socket.on('reset_room', ({ roomId, hostKey }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const isHostAuthorized = socket.id === room.hostSocketId || (hostKey && hostKey === room.hostKey);
    if (!isHostAuthorized) {
      console.warn(`Unauthorized reset_room attempt from socket ${socket.id} on room ${roomId}`);
      return;
    }

    resetRoomToTitle(room);
    console.log(`Room ${roomId} has been reset to Title Slide by Hostess.`);
  });

  // Disconnect handling (Zombie player prevention + Option B 30s Empty Room Timer)
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.lastActivity = Date.now();
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.disconnected = true;
          console.log(`Player ${player.nickname} marked as disconnected.`);

          if (room.status === 'lobby') {
            room.players = room.players.filter(p => p.id !== socket.id);
          } else if (room.status === 'question') {
            checkAllAnswersSubmitted(room);
          }

          // OPTION B: If 0 connected active players remain during a game, start 30s grace timer!
          const activeConnectedCount = room.players.filter(p => !p.disconnected).length;
          if (room.status !== 'lobby' && activeConnectedCount === 0) {
            startEmptyRoomTimer(room);
          } else {
            broadcastRoomState(socket.roomId);
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Mercedes Exhibition Quiz Server running on port ${PORT}`);
});
