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

const MAX_PLAYERS = 4;
const QUESTION_TIMEOUT_SECONDS = 15;

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
    feedbackTimerSeconds: room.feedbackTimerSeconds || 0,
    answersReceivedCount: room.players.filter(p => p.answered && !p.disconnected).length,
    currentQuestion: currentQ ? {
      id: currentQ.id,
      questionText: currentQ.question[room.language.toLowerCase()] || currentQ.question.de,
      options: currentQ.options[room.language.toLowerCase()] || currentQ.options.de,
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

  room.status = 'title';
  room.players = [];
  room.currentQuestionIndex = 0;
  room.timerSeconds = QUESTION_TIMEOUT_SECONDS;
  room.emptyRoomTimerSeconds = 0;
  room.isPaused = false;

  broadcastRoomState(room.roomId);
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
  
  // If last question, skip cooldown timer and go straight to final leaderboard
  if (room.currentQuestionIndex + 1 >= totalQuestions) {
    room.status = 'leaderboard';
    broadcastRoomState(room.roomId);
    return;
  }

  room.status = 'feedback';
  room.feedbackTimerSeconds = 5;
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

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create room (Host action)
  socket.on('create_room', ({ roomId, mode = 'standard', language = 'DE' }, callback) => {
    const code = roomId || `ROOM_${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Select questions
    const shuffledQuestions = [...QUESTIONS].sort(() => 0.5 - Math.random());
    
    const newRoom = {
      roomId: code,
      hostSocketId: socket.id,
      mode, // 'standard' (10) or 'express' (5)
      language, // 'DE' or 'EN'
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

    console.log(`Room created: ${code}`);
    if (callback) callback({ success: true, roomId: code, state: getPublicRoomState(newRoom) });
    broadcastRoomState(code);
  });

  // Join room (Mobile action)
  socket.on('join_room', ({ roomId, nickname, playerKey }, callback) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      return callback({ success: false, error: 'ROOM_NOT_FOUND', message: 'RAUM NICHT GEFUNDEN / ROOM NOT FOUND' });
    }

    const key = playerKey || `PK_${Math.random().toString(36).substring(2, 9)}`;

    // OPTION A: Check if player is rejoining after refresh (by playerKey OR nickname)
    let player = room.players.find(p => 
      (key && p.playerKey === key) || 
      (nickname && p.nickname.toLowerCase() === nickname.trim().toLowerCase())
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
      callback({ success: true, player, playerKey: player.playerKey || key, rejoined: true, state: getPublicRoomState(room) });
      broadcastRoomState(roomId);
      return;
    }

    if (room.status !== 'lobby') {
      return callback({ success: false, error: 'GAME_IN_PROGRESS', message: 'RUNDE LÄUFT BEREITS / GAME IN PROGRESS' });
    }

    const activePlayers = room.players.filter(p => !p.disconnected);
    if (activePlayers.length >= MAX_PLAYERS) {
      return callback({ success: false, error: 'ROOM_FULL', message: 'RAUM IST VOLL (MAX 4 SPIELER)' });
    }

    player = {
      id: socket.id,
      playerKey: key,
      nickname: nickname.trim() || `Player_${activePlayers.length + 1}`,
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
    callback({ success: true, player, playerKey: key, rejoined: false, state: getPublicRoomState(room) });
    broadcastRoomState(roomId);
  });

  // Host starts quiz
  socket.on('start_quiz', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'lobby') return;

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

  // Submit answer (Mobile action)
  socket.on('submit_answer', ({ roomId, optionIndex }, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'question') {
      if (callback) callback({ success: false, error: 'NOT_IN_QUESTION_PHASE' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.answered) {
      if (callback) callback({ success: false, error: 'ALREADY_ANSWERED' });
      return;
    }

    const currentQ = room.questions[room.currentQuestionIndex];
    const secondsTaken = (Date.now() - room.questionStartTime) / 1000;
    const isCorrect = optionIndex === currentQ.correctAnswerIndex;

    player.answered = true;
    player.lastAnswerCorrect = isCorrect;

    if (isCorrect) {
      // Speed-based scoring: 1000 * (1 - (seconds_taken / total_seconds))
      const points = Math.max(0, Math.round(1000 * (1 - (secondsTaken / QUESTION_TIMEOUT_SECONDS))));
      player.lastPointsEarned = points;
      player.score += points;
    } else {
      player.lastPointsEarned = 0;
    }

    if (callback) callback({ success: true, isCorrect, pointsEarned: player.lastPointsEarned });

    // Update real-time count on host
    broadcastRoomState(roomId);

    // Check if all connected players submitted
    checkAllAnswersSubmitted(room);
  });

  // Next question or view leaderboard (Host action or Auto-advance)
  socket.on('next_question', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    advanceToNextQuestion(room);
  });

  // Admin Hostess Quick Reset
  socket.on('reset_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    resetRoomToTitle(room);
    console.log(`Room ${roomId} has been reset to Title Slide by Hostess.`);
  });

  // Disconnect handling (Zombie player prevention + Option B 30s Empty Room Timer)
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
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
