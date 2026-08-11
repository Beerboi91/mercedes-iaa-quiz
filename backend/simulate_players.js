import { io } from 'socket.io-client';

// Usage: node simulate_players.js <ROOM_ID> <BOT_COUNT> <SERVER_URL>
// Example: node simulate_players.js ROOM_1234 15 https://mercedes-iaa-quiz-backend.onrender.com

const targetRoom = (process.argv[2] || 'ROOM_1234').toUpperCase();
const botCount = Math.min(20, parseInt(process.argv[3] || '15', 10));
const serverUrl = process.argv[4] || 'http://localhost:3001';

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

const bots = [];

for (let i = 0; i < botCount; i++) {
  const name = botNames[i % botNames.length] + (i >= botNames.length ? `_${i + 1}` : '');
  const socket = io(serverUrl);
  
  let currentQuestion = -1;

  socket.on('connect', () => {
    socket.emit('join_room', { roomId: targetRoom, nickname: name }, (res) => {
      if (res && res.success) {
        console.log(`✅ [Bot ${i + 1}/${botCount}] "${name}" joined room ${targetRoom}`);
      } else {
        console.log(`❌ [Bot ${name}] Failed to join: ${res?.message || res?.error}`);
      }
    });
  });

  socket.on('room_state', (state) => {
    if (!state) return;

    if (state.status === 'question' && state.currentQuestionIndex !== currentQuestion) {
      currentQuestion = state.currentQuestionIndex;
      
      // Random answer delay between 1.5s and 18s to simulate human response time
      const delay = Math.floor(1500 + Math.random() * 16500);
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

  bots.push(socket);
}

console.log(`\n🚀 ${botCount} Bots running! Keep this terminal window open while testing.`);
console.log(`Press Ctrl+C to stop all bots and clear the room.\n`);
