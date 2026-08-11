import { io } from 'socket.io-client';

// Usage: node simulate_players.js <ROOM_ID> <BOT_COUNT> <SERVER_URL>
// Example: node simulate_players.js ROOM_1234 15 https://mercedes-iaa-quiz.onrender.com

const targetRoom = (process.argv[2] || 'ROOM_1234').toUpperCase();
const botCount = Math.min(20, parseInt(process.argv[3] || '15', 10));
const serverUrl = process.argv[4] || 'https://mercedes-iaa-quiz.onrender.com';

console.log(`\n🤖 =================================================`);
console.log(`   MERCEDES IAA QUIZ - BOT SIMULATOR`);
console.log(`   Room ID:    ${targetRoom}`);
console.log(`   Bot Count:  ${botCount}`);
console.log(`   Target URL: ${serverUrl}`);
console.log(`=================================================\n`);

const botNames = [
  'Michael', 'Sarah', 'Alex', 'Elena', 'Lucas',
  'David', 'Emma', 'Daniel', 'Sophie', 'Felix',
  'Laura', 'Julian', 'Anna', 'Marco', 'Clara',
  'Maximilian', 'Mia', 'Tim', 'Hannah', 'Ben'
];

for (let i = 0; i < botCount; i++) {
  setTimeout(() => {
    const name = botNames[i % botNames.length] + (i >= botNames.length ? `_${i + 1}` : '');
    const socket = io(serverUrl, {
      transports: ['polling', 'websocket']
    });

    let currentQuestion = -1;

    socket.on('connect_error', (err) => {
      console.log(`⚠️ [Bot ${name}] Connect error: ${err.message}`);
    });

    const joinRoom = () => {
      socket.emit('join_room', { roomId: targetRoom, nickname: name }, (res) => {
        if (res && res.success) {
          console.log(`✅ [Bot ${i + 1}/${botCount}] "${name}" joined room ${targetRoom}`);
        } else {
          console.log(`❌ [Bot ${name}] Failed to join ${targetRoom}: ${res?.message || res?.error || 'Unknown error'}`);
        }
      });
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.on('connect', joinRoom);
    }

    socket.on('room_state', (state) => {
      if (!state) return;

      if (state.status === 'question' && state.currentQuestionIndex !== currentQuestion) {
        currentQuestion = state.currentQuestionIndex;
        
        // Random answer delay between 1.5s and 15s
        const delay = Math.floor(1500 + Math.random() * 13500);
        const randomOption = Math.floor(Math.random() * 4);

        setTimeout(() => {
          socket.emit('submit_answer', { roomId: targetRoom, optionIndex: randomOption }, (res) => {
            if (res && res.success) {
              const statusStr = res.isCorrect ? `Correct (+${res.pointsEarned}pts)` : 'Wrong (0pts)';
              console.log(`🎯 [Bot ${name}] Answered Q${currentQuestion + 1} -> ${statusStr}`);
            }
          });
        }, delay);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 [Bot ${name}] Disconnected`);
    });
  }, i * 150);
}

console.log(`🚀 ${botCount} Bots initializing... Keep this terminal open while testing.\n`);
