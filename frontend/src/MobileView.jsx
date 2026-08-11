import React, { useState, useEffect } from 'react';
import { socket } from './socket.js';

export default function MobileView({ navigate }) {
  const queryParams = new URLSearchParams(window.location.search);
  const roomParam = queryParams.get('room') || '';

  const [roomId, setRoomId] = useState(roomParam);
  const [nickname, setNickname] = useState('');
  const [joined, setJoined] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [roomState, setRoomState] = useState(null);

  const [selectedOption, setSelectedOption] = useState(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [giveawayClaimed, setGiveawayClaimed] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);
  const [lastResult, setLastResult] = useState(() => {
    try {
      const saved = localStorage.getItem('mb_quiz_last_result');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // If user scanned a QR code with a roomParam, check if it differs
      if (roomParam) {
        const cleanParam = roomParam.trim().toUpperCase();
        if (parsed?.roomId && parsed.roomId !== cleanParam) {
          localStorage.removeItem('mb_quiz_last_result');
          sessionStorage.removeItem('mb_quiz_session');
          localStorage.removeItem('mb_quiz_session');
          return null;
        }
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });

  // Helper for session storage
  const getStoredSession = () => {
    try {
      const sess = sessionStorage.getItem('mb_quiz_session') || localStorage.getItem('mb_quiz_session');
      return sess ? JSON.parse(sess) : null;
    } catch (e) {
      return null;
    }
  };

  const setStoredSession = (data) => {
    try {
      const json = JSON.stringify(data);
      sessionStorage.setItem('mb_quiz_session', json);
      localStorage.setItem('mb_quiz_session', json);
    } catch (e) { }
  };

  const clearStoredSession = () => {
    try {
      sessionStorage.removeItem('mb_quiz_session');
      localStorage.removeItem('mb_quiz_session');
    } catch (e) { }
  };

  // Rejoin attempt logic
  const attemptRejoin = () => {
    const savedSession = getStoredSession();
    if (!savedSession) return;

    const { roomId: savedRoom, nickname: savedName, playerKey } = savedSession;
    
    // If scanning a brand new room via QR code, drop old session
    if (roomParam && roomParam.trim().toUpperCase() !== savedRoom) {
      clearStoredSession();
      setJoined(false);
      setRoomState(null);
      return;
    }

    const targetRoom = roomParam ? roomParam.trim().toUpperCase() : savedRoom;

    if (targetRoom && playerKey) {
      setRoomId(targetRoom);
      setNickname(savedName || '');

      socket.emit('join_room', { roomId: targetRoom, nickname: savedName || 'Player', playerKey }, (res) => {
        if (res && res.success && res.state && res.state.status !== 'title') {
          setJoined(true);
          setRoomState(res.state);
          if (res.playerKey) {
            setStoredSession({ roomId: targetRoom, nickname: savedName, playerKey: res.playerKey });
          }
        } else {
          clearStoredSession();
          setJoined(false);
          setRoomState(null);
        }
      });
    }
  };

  // Pre-fetch room info (language) when roomParam is present
  useEffect(() => {
    if (roomParam) {
      const cleanRoom = roomParam.trim().toUpperCase();
      socket.emit('get_room_info', { roomId: cleanRoom }, (res) => {
        if (res && res.success && res.language) {
          setRoomState(prev => prev ? { ...prev, language: res.language } : { language: res.language });
        }
      });
    }
  }, [roomParam]);

  // OPTION A: Auto-rejoin on mount AND on socket reconnect
  useEffect(() => {
    attemptRejoin();

    const onConnect = () => {
      attemptRejoin();
    };

    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, []);

  useEffect(() => {
    const handleRoomState = (state) => {
      if (!state || state.status === 'title') {
        clearStoredSession();
        setJoined(false);
        setRoomState(null);
        setRoundEnded(true);
        return;
      }

      setRoomState(state);

      if (state.status === 'question' && answerSubmitted && state.players) {
        const me = state.players.find(p => p.id === socket.id);
        if (me && !me.answered) {
          setAnswerSubmitted(false);
          setSelectedOption(null);
        }
      }

      if (state.status === 'leaderboard' && state.players) {
        const sorted = [...state.players].sort((a, b) => b.score - a.score);
        const rankIndex = sorted.findIndex(p => p.id === socket.id);
        if (rankIndex >= 0) {
          const rank = rankIndex + 1;
          const isWinner = rank === 1;
          const resultData = { rank, isWinner, nickname: sorted[rankIndex].nickname, roomId: state.roomId, language: state.language };
          setLastResult(resultData);
          try {
            localStorage.setItem('mb_quiz_last_result', JSON.stringify(resultData));
          } catch (e) {}
        }
      }

      if (state.status === 'feedback' && state.players) {
        const me = state.players.find(p => p.id === socket.id);
        if (me) {
          setLastFeedback({
            isCorrect: me.lastAnswerCorrect,
            pointsEarned: me.lastPointsEarned,
            totalScore: me.score
          });
        }
      }
    };

    const handleRoomReset = () => {
      clearStoredSession();
      setJoined(false);
      setRoomState(null);
      setSelectedOption(null);
      setAnswerSubmitted(false);
      setLastFeedback(null);
      setNickname('');
      setRoomId('');
      setRoundEnded(true);
      try {
        window.history.replaceState({}, '', '/mobile');
      } catch (e) {}
    };

    socket.on('room_state', handleRoomState);
    socket.on('room_reset', handleRoomReset);
    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('room_reset', handleRoomReset);
    };
  }, [answerSubmitted]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!roomId.trim() || !nickname.trim()) return;

    setErrorMsg('');
    const savedSession = getStoredSession();
    let existingKey = savedSession ? savedSession.playerKey : null;

    socket.emit('join_room', { roomId: roomId.trim().toUpperCase(), nickname: nickname.trim(), playerKey: existingKey }, (res) => {
      if (res.success) {
        setJoined(true);
        setRoomState(res.state);
        if (res.playerKey) {
          setStoredSession({
            roomId: roomId.trim().toUpperCase(),
            nickname: nickname.trim(),
            playerKey: res.playerKey
          });
        }
      } else {
        setErrorMsg(res.message || 'BEITRETT FEHLGESCHLAGEN / JOIN FAILED');
      }
    });
  };

  const handleSelectOption = (idx) => {
    if (answerSubmitted || roomState?.status !== 'question') return;

    setSelectedOption(idx);
    setAnswerSubmitted(true);

    socket.emit('submit_answer', { roomId: roomState.roomId, optionIndex: idx }, (res) => {
      if (res && res.success) {
        setLastFeedback({
          isCorrect: res.isCorrect,
          pointsEarned: res.pointsEarned
        });
      }
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
      <div style={{ padding: '1.5rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* SCREEN 0: Round Ended Notice / Last Result Screen */}
        {(!joined && (roundEnded || lastResult)) ? (
          <div style={{ margin: 'auto 0', textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '75px' }} />
            </div>

            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem', fontFamily: 'MBCorpoSTitle', color: '#000000', lineHeight: '1.2' }}>
              {(lastResult?.language === 'EN' || roomState?.language === 'EN') ? 'THIS ROUND HAS ENDED!' : 'DIESE RUNDE IST BEENDET!'}
            </h1>
            <p style={{ fontSize: '1.1rem', color: '#555555', marginBottom: '1rem', fontFamily: 'MBCorpoSText', lineHeight: '1.4' }}>
              {(lastResult?.language === 'EN' || roomState?.language === 'EN')
                ? 'Scan the new QR code on the main screen to play again.'
                : 'Scanne den neuen QR-Code auf dem Haupt-Bildschirm, um erneut zu spielen.'}
            </p>

            {/* Last Result & Giveaway Info Card */}
            {lastResult && (
              <div className="mb-slide-enter" style={{ background: '#ffffff', border: '2px solid #000000', padding: '1.5rem 1.25rem', marginTop: '1rem' }}>
                <div className="mb-trophy-pulse" style={{ position: 'relative', display: 'inline-block', marginBottom: '1rem' }}>
                  <img src="/Pokal.svg" alt="Trophy" style={{ height: '100px' }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: '25%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontFamily: 'MBCorpoSTitle',
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: '#000000'
                    }}
                  >
                    {lastResult.rank}
                  </div>
                </div>

                <h2 style={{ fontSize: '1.6rem', fontFamily: 'MBCorpoSTitle', color: lastResult.isWinner ? '#1CA0FF' : '#000000', marginBottom: '0.5rem' }}>
                  {lastResult.isWinner
                    ? (lastResult.language === 'EN' ? '1ST PLACE – MAIN PRIZE!' : '1. PLATZ – HAUPTGEWINN!')
                    : (lastResult.language === 'EN' ? `RANK ${lastResult.rank} – GIVEAWAY` : `${lastResult.rank}. PLATZ – GIVEAWAY`)}
                </h2>

                <p style={{ fontSize: '1.1rem', fontFamily: 'MBCorpoSText', color: lastResult.isWinner ? '#000000' : '#555555', fontWeight: lastResult.isWinner ? 'bold' : 'normal', lineHeight: '1.4' }}>
                  {lastResult.isWinner
                    ? (lastResult.language === 'EN'
                        ? '[Placeholder] Congratulations on the main prize! Show your screen at the booth.'
                        : '[Platzhalter] Herzlichen Glückwunsch zum Hauptgewinn! Zeige deinen Bildschirm am Stand vor.')
                    : (lastResult.language === 'EN'
                        ? '[Placeholder] Collect your giveaway! Show your screen at the booth.'
                        : '[Platzhalter] Hol dir ein Giveaway! Zeige deinen Bildschirm am Stand vor.')}
                </p>
              </div>
            )}
          </div>
        ) : !joined && (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '70px' }} />
            </div>

            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem', textAlign: 'center', fontFamily: 'MBCorpoSTitle' }}>
              {roomState?.language === 'EN' ? 'WELCOME TO THE QUIZ' : 'WILLKOMMEN BEIM QUIZ'}
            </h1>
            <p style={{ textAlign: 'center', color: '#737373', marginBottom: '2.5rem', fontSize: '1.1rem' }}>
              {roomState?.language === 'EN' ? 'Enter your nickname' : 'Gib deinen Spitznamen ein'}
            </p>

            {errorMsg && (
              <div style={{ background: '#737373', color: '#ffffff', padding: '1rem', marginBottom: '1.5rem', fontWeight: 'bold', textAlign: 'center', fontFamily: 'MBCorpoSTitle' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'MBCorpoSTitle', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                  {roomState?.language === 'EN' ? 'NICKNAME:' : 'SPITZNAME / NICKNAME:'}
                </label>
                <input
                  type="text"
                  placeholder={roomState?.language === 'EN' ? 'Your Name' : 'Dein Name'}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={15}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', border: '2px solid #000000', borderRadius: '0px', fontFamily: 'MBCorpoSText' }}
                  autoFocus
                  required
                />
              </div>

              <button type="submit" className="mb-btn" style={{ width: '100%', marginTop: '1rem', padding: '1.2rem' }}>
                {roomState?.language === 'EN' ? 'JOIN QUIZ' : 'QUIZ BEITRETEN'}
              </button>
            </form>
          </div>
        )}

        {/* SCREEN 2: Waiting Lobby */}
        {joined && roomState?.status === 'lobby' && (
          <div style={{ margin: 'auto 0', textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '75px' }} />
            </div>

            <h1 style={{ fontSize: '2.2rem', marginBottom: '1rem', fontFamily: 'MBCorpoSTitle' }}>
              {roomState?.language === 'EN' ? `YOU'RE IN, ${nickname.toUpperCase()}!` : `DU BIST DABEI, ${nickname.toUpperCase()}!`}
            </h1>
            <p style={{ fontSize: '1.2rem', color: '#555555', marginBottom: '2.5rem', lineHeight: '1.4' }}>
              {roomState?.language === 'EN' ? 'Look at the main screen... The quiz starts shortly!' : 'Schau auf den Haupt-Bildschirm... Das Quiz startet in Kürze!'}
            </p>
            <div style={{ background: '#1CA0FF', color: '#ffffff', padding: '1rem 1.75rem', fontFamily: 'MBCorpoSTitle', fontSize: '1.2rem', fontWeight: 'bold', display: 'inline-block', marginBottom: '2rem' }}>
              {roomState?.language === 'EN' ? `WAITING (${roomState.playerCount}/${roomState.maxPlayers} PLAYERS)` : `WARTEN (${roomState.playerCount}/${roomState.maxPlayers} SPIELER)`}
            </div>

            <div>
              <button
                className="mb-btn mb-btn-outline"
                style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => {
                  if (roomState?.roomId) {
                    socket.emit('leave_room', { roomId: roomState.roomId });
                  }
                  clearStoredSession();
                  setJoined(false);
                  setRoomState(null);
                }}
              >
                {roomState?.language === 'EN' ? 'LEAVE ROOM' : 'RAUM VERLASSEN'}
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 3: Active Question View (`Frame 2 - Frage 1.png` & `Frame 2 - Frage 2 - richtige Antwort.png`) */}
        {joined && roomState?.status === 'question' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', padding: '0.5rem 0 1rem 0' }}>
            {/* Top Timer Progress Bar & Counter (GANZ OBEN) */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ width: '100%', height: '6px', background: '#e5e5e5', marginBottom: '0.6rem' }}>
                <div
                  style={{
                    height: '100%',
                    background: '#1CA0FF',
                    width: `${Math.min(100, Math.max(0, (roomState.timerSeconds / (roomState.maxQuestionTimerSeconds || 25)) * 100))}%`,
                    transition: 'width 1s linear'
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ color: '#1CA0FF', fontFamily: 'MBCorpoSTitle', fontSize: '1.15rem', fontWeight: 'bold' }}>
                  {roomState.language === 'EN' ? 'QUESTION' : 'FRAGE'} {roomState.currentQuestionIndex + 1} {roomState.language === 'EN' ? 'OF' : 'VON'} {roomState.totalQuestions}
                </span>
                <span style={{ color: '#000000', fontFamily: 'MBCorpoSTitle', fontSize: '1.15rem', fontWeight: 'bold' }}>
                  {roomState.timerSeconds}S
                </span>
              </div>

              {/* Live Answers Count Plain Text Left-Aligned */}
              <div style={{ padding: '0 0.5rem', textAlign: 'left' }}>
                <span style={{
                  color: '#1CA0FF',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  fontFamily: 'MBCorpoSTitle, sans-serif'
                }}>
                  {roomState.language === 'EN' ? 'Players answered:' : 'Spieler geantwortet:'} {roomState.answersReceivedCount || 0}/{roomState.playerCount || 0}
                </span>
              </div>
            </div>

            {/* Top Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '60px' }} />
            </div>

            {/* Question Text Centered */}
            <h2 className="mb-slide-enter" style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '1.25rem', lineHeight: '1.3', fontFamily: 'MBCorpoSTitle', color: '#000000', textTransform: 'uppercase' }}>
              {roomState.currentQuestion?.questionText}
            </h2>

            {/* Option Buttons (Matching Frame 2 Layout) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {roomState.currentQuestion?.options.map((opt, idx) => {
                const isSelected = selectedOption === idx;
                const letter = String.fromCharCode(65 + idx);

                return (
                  <div
                    key={idx}
                    className={`mb-designer-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(idx)}
                  >
                    <div className="letter-box">{letter}</div>
                    <div className="text-box">{opt}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SCREEN 4: Question Result Feedback View (During Question Progress) */}
        {joined && roomState?.status === 'feedback' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', padding: '1.5rem 0', textAlign: 'center' }}>
            {/* Top Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '70px' }} />
            </div>

            <div style={{ margin: 'auto 0' }}>
              {/* Circular Countdown Ring */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
                <div className="mb-circular-timer-container" style={{ width: '120px', height: '120px', margin: '0 0 0.5rem 0' }}>
                  <svg className="mb-circular-svg" viewBox="0 0 160 160">
                    <circle className="mb-circular-bg-ring" cx="80" cy="80" r="70" />
                    <circle
                      className="mb-circular-progress-ring"
                      cx="80"
                      cy="80"
                      r="70"
                      style={{
                        strokeDasharray: 439.82,
                        strokeDashoffset: 439.82 * (1 - (roomState.feedbackTimerSeconds / 8))
                      }}
                    />
                  </svg>
                  <div className="mb-circular-number">{roomState.feedbackTimerSeconds}</div>
                </div>
                <span style={{ fontFamily: 'MBCorpoSTitle', fontSize: '1rem', color: '#737373', fontWeight: 'bold' }}>
                  {roomState.language === 'EN' ? 'NEXT QUESTION IN' : 'NÄCHSTE FRAGE IN'} {roomState.feedbackTimerSeconds}S
                </span>
              </div>

              {/* Score Result Box */}
              {lastFeedback?.isCorrect === true ? (
                <div style={{ background: '#1CA0FF', color: '#ffffff', padding: '2rem 1.5rem', marginBottom: '1.5rem' }}>
                  <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontFamily: 'MBCorpoSTitle' }}>{roomState.language === 'EN' ? 'CORRECT!' : 'RICHTIG!'}</h1>
                  <p style={{ fontSize: '1.4rem', fontFamily: 'MBCorpoSTitle' }}>+{lastFeedback.pointsEarned} {roomState.language === 'EN' ? 'POINTS' : 'PUNKTE'}</p>
                </div>
              ) : (
                <div style={{ background: '#737373', color: '#ffffff', padding: '2rem 1.5rem', marginBottom: '1.5rem' }}>
                  <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontFamily: 'MBCorpoSTitle' }}>{roomState.language === 'EN' ? 'WRONG' : 'FALSCH'}</h1>
                  <p style={{ fontSize: '1.2rem', fontFamily: 'MBCorpoSTitle' }}>0 {roomState.language === 'EN' ? 'POINTS' : 'PUNKTE'}</p>
                </div>
              )}

              {/* Prominent Correct Answer Card on Mobile */}
              {roomState.currentQuestion && (
                <div style={{ background: '#f5f5f5', borderLeft: '5px solid #1CA0FF', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.85rem', color: '#737373', fontFamily: 'MBCorpoSTitle', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                    {roomState.language === 'EN' ? 'CORRECT ANSWER:' : 'RICHTIGE ANTWORT:'}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>
                    {String.fromCharCode(65 + roomState.currentQuestion.correctAnswerIndex)}: {roomState.currentQuestion.options[roomState.currentQuestion.correctAnswerIndex]}
                  </div>
                </div>
              )}
            </div>

            <p style={{ color: '#737373', fontFamily: 'MBCorpoSTitle', fontSize: '1.1rem' }}>
              {roomState.language === 'EN' ? 'Look at the main screen!' : 'Schau auf den Haupt-Bildschirm!'}
            </p>
          </div>
        )}

        {/* SCREEN 5: Final Giveaway Screen (`Frame 4 - Starke Leistung.png` & `Pokal.svg`) */}
        {joined && roomState?.status === 'leaderboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', padding: '1rem 0', textAlign: 'center' }}>
            {/* Top Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '70px' }} />
            </div>

            <div style={{ margin: 'auto 0' }}>
              {(() => {
                const sorted = roomState?.players ? [...roomState.players].sort((a, b) => b.score - a.score) : [];
                const rankIndex = sorted.findIndex(p => p.id === socket.id);
                const rank = rankIndex >= 0 ? rankIndex + 1 : 1;
                const isWinner = rank === 1;

                return (
                  <>
                    {/* Pokal SVG Container */}
                    <div className="mb-trophy-pulse" style={{ position: 'relative', display: 'inline-block', marginBottom: '1.5rem' }}>
                      <img src="/Pokal.svg" alt="Trophy" style={{ height: '140px' }} />
                      <div
                        style={{
                          position: 'absolute',
                          top: '25%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          fontFamily: 'MBCorpoSTitle',
                          fontSize: '2rem',
                          fontWeight: 'bold',
                          color: '#000000'
                        }}
                      >
                        {rank}
                      </div>
                    </div>

                    {isWinner ? (
                      <>
                        <h1 style={{ fontSize: '2.4rem', marginBottom: '0.75rem', fontFamily: 'MBCorpoSTitle', color: '#1CA0FF', lineHeight: '1.1' }}>
                          {roomState.language === 'EN' ? '1ST PLACE – MAIN PRIZE!' : '1. PLATZ – HAUPTGEWINN!'}
                        </h1>
                        <p style={{ fontSize: '1.2rem', color: '#000000', marginBottom: '1.5rem', fontFamily: 'MBCorpoSText', lineHeight: '1.4' }}>
                          {roomState.language === 'EN'
                            ? '[Placeholder] Congratulations on the main prize! Show your screen at the booth.'
                            : '[Platzhalter] Herzlichen Glückwunsch zum Hauptgewinn! Zeige deinen Bildschirm am Stand vor.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <h1 style={{ fontSize: '2.2rem', marginBottom: '0.75rem', fontFamily: 'MBCorpoSTitle', color: '#000000', lineHeight: '1.1' }}>
                          {roomState.language === 'EN' ? `RANK ${rank} – GIVEAWAY` : `${rank}. PLATZ – GIVEAWAY`}
                        </h1>
                        <p style={{ fontSize: '1.2rem', color: '#737373', marginBottom: '1.5rem', fontFamily: 'MBCorpoSText', lineHeight: '1.4' }}>
                          {roomState.language === 'EN'
                            ? '[Placeholder] Collect your giveaway! Show your screen at the booth.'
                            : '[Platzhalter] Hol dir ein Giveaway! Zeige deinen Bildschirm am Stand vor.'}
                        </p>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
