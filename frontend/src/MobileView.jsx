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
    } catch (e) {}
  };

  const clearStoredSession = () => {
    try {
      sessionStorage.removeItem('mb_quiz_session');
      localStorage.removeItem('mb_quiz_session');
    } catch (e) {}
  };

  // Rejoin attempt logic
  const attemptRejoin = () => {
    const savedSession = getStoredSession();
    if (!savedSession) return;

    const { roomId: savedRoom, nickname: savedName, playerKey } = savedSession;
    const targetRoom = roomParam || savedRoom;

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

    socket.on('room_state', handleRoomState);
    return () => socket.off('room_state', handleRoomState);
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
      {/* Header */}
      <div className="slide-header" style={{ padding: '1rem 1.5rem', borderBottom: '2px solid #000000' }}>
        <div>
          <span style={{ fontFamily: 'MBCorpoSTitle', fontWeight: 'bold', fontSize: '1rem' }}>MERCEDES-BENZ QUIZ</span>
        </div>
        <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '40px' }} />
      </div>

      <div style={{ padding: '1.5rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* SCREEN 1: Nickname Input / Room Code */}
        {!joined && (
          <div style={{ margin: 'auto 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '70px' }} />
            </div>

            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem', textAlign: 'center', fontFamily: 'MBCorpoSTitle' }}>WILLKOMMEN BEIM QUIZ</h1>
            <p style={{ textAlign: 'center', color: '#737373', marginBottom: '2.5rem', fontSize: '1.1rem' }}>Gib den Raumcode & deinen Namen ein</p>

            {errorMsg && (
              <div style={{ background: '#737373', color: '#ffffff', padding: '1rem', marginBottom: '1.5rem', fontWeight: 'bold', textAlign: 'center', fontFamily: 'MBCorpoSTitle' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'MBCorpoSTitle', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.95rem' }}>SPITZNAME / NICKNAME:</label>
                <input
                  type="text"
                  placeholder="Dein Name"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={15}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', border: '2px solid #000000', borderRadius: '0px', fontFamily: 'MBCorpoSText' }}
                  autoFocus
                  required
                />
              </div>

              <button type="submit" className="mb-btn" style={{ width: '100%', marginTop: '1rem', padding: '1.2rem' }}>
                QUIZ BEITRETEN
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

            <h1 style={{ fontSize: '2.2rem', marginBottom: '1rem', fontFamily: 'MBCorpoSTitle' }}>DU BIST DABEI, {nickname.toUpperCase()}!</h1>
            <p style={{ fontSize: '1.2rem', color: '#555555', marginBottom: '2.5rem', lineHeight: '1.4' }}>
              Schau auf den Haupt-Bildschirm... Das Quiz startet in Kürze!
            </p>
            <div style={{ background: '#1CA0FF', color: '#ffffff', padding: '1rem 1.75rem', fontFamily: 'MBCorpoSTitle', fontSize: '1.2rem', fontWeight: 'bold', display: 'inline-block', marginBottom: '2rem' }}>
              WARTEN ({roomState.playerCount}/{roomState.maxPlayers} SPIELER)
            </div>

            <div>
              <button
                className="mb-btn mb-btn-outline"
                style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => {
                  clearStoredSession();
                  setJoined(false);
                  setRoomState(null);
                }}
              >
                RAUM VERLASSEN
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 3: Active Question View (`Frame 2 - Frage 1.png` & `Frame 2 - Frage 2 - richtige Antwort.png`) */}
        {joined && roomState?.status === 'question' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', padding: '1rem 0' }}>
            {/* Top Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <img src="/logo.svg" alt="Mercedes-Benz Logo" style={{ height: '70px' }} />
            </div>

            {/* Question Text Centered */}
            <h2 style={{ fontSize: '1.7rem', textAlign: 'center', marginBottom: '2rem', lineHeight: '1.3', fontFamily: 'MBCorpoSTitle', color: '#000000', textTransform: 'uppercase' }}>
              {roomState.currentQuestion?.questionText}
            </h2>

            {/* Option Buttons (Matching Frame 2 Layout) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
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

            {/* Bottom Progress Counter (e.g. "1 von 10" matching designer slide) */}
            <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: '1rem' }}>
              <div style={{ width: '100%', height: '4px', background: '#e5e5e5', marginBottom: '1rem' }}>
                <div
                  style={{
                    height: '100%',
                    background: '#1CA0FF',
                    width: `${(roomState.timerSeconds / 15) * 100}%`,
                    transition: 'width 1s linear'
                  }}
                />
              </div>
              <p style={{ color: '#1CA0FF', fontFamily: 'MBCorpoSTitle', fontSize: '1.4rem', fontWeight: 'bold' }}>
                {roomState.currentQuestionIndex + 1} von {roomState.totalQuestions}
              </p>
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
                        strokeDashoffset: 439.82 * (1 - (roomState.feedbackTimerSeconds / 10))
                      }}
                    />
                  </svg>
                  <div className="mb-circular-number" style={{ fontSize: '2.6rem' }}>{roomState.feedbackTimerSeconds}</div>
                </div>
                <span style={{ fontFamily: 'MBCorpoSTitle', fontSize: '1rem', color: '#737373', fontWeight: 'bold' }}>
                  NÄCHSTE FRAGE IN {roomState.feedbackTimerSeconds}S
                </span>
              </div>

              {/* Score Result Box */}
              {lastFeedback?.isCorrect === true ? (
                <div style={{ background: '#1CA0FF', color: '#ffffff', padding: '2rem 1.5rem', marginBottom: '1.5rem' }}>
                  <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontFamily: 'MBCorpoSTitle' }}>RICHTIG!</h1>
                  <p style={{ fontSize: '1.4rem', fontFamily: 'MBCorpoSTitle' }}>+{lastFeedback.pointsEarned} PUNKTE</p>
                </div>
              ) : (
                <div style={{ background: '#737373', color: '#ffffff', padding: '2rem 1.5rem', marginBottom: '1.5rem' }}>
                  <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', fontFamily: 'MBCorpoSTitle' }}>FALSCH</h1>
                  <p style={{ fontSize: '1.2rem', fontFamily: 'MBCorpoSTitle' }}>0 PUNKTE</p>
                </div>
              )}

              {/* Prominent Correct Answer Card on Mobile */}
              {roomState.currentQuestion && (
                <div style={{ background: '#f5f5f5', borderLeft: '5px solid #1CA0FF', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.85rem', color: '#737373', fontFamily: 'MBCorpoSTitle', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                    RICHTIGE ANTWORT:
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>
                    {String.fromCharCode(65 + roomState.currentQuestion.correctAnswerIndex)}: {roomState.currentQuestion.options[roomState.currentQuestion.correctAnswerIndex]}
                  </div>
                </div>
              )}
            </div>

            <p style={{ color: '#737373', fontFamily: 'MBCorpoSTitle', fontSize: '1.1rem' }}>
              Schau auf den Haupt-Bildschirm!
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
              {/* Pokal SVG Container */}
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: '1.5rem' }}>
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
                  {(() => {
                    const sorted = roomState?.players ? [...roomState.players].sort((a, b) => b.score - a.score) : [];
                    const rank = sorted.findIndex(p => p.id === socket.id) + 1;
                    return rank > 0 ? rank : 1;
                  })()}
                </div>
              </div>

              <h1 style={{ fontSize: '2.6rem', marginBottom: '0.75rem', fontFamily: 'MBCorpoSTitle', color: '#000000', lineHeight: '1.1' }}>
                STARKE LEISTUNG!
              </h1>
              <p style={{ fontSize: '1.2rem', color: '#000000', marginBottom: '1.5rem', fontFamily: 'MBCorpoSText', lineHeight: '1.4' }}>
                Hol dir jetzt dein Giveaway am Schalter ab.
              </p>

              {/* Hostess Claimed Toggle */}
              <div style={{ borderTop: '2px solid #e5e5e5', paddingTop: '1.25rem', marginTop: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#737373', marginBottom: '0.75rem', fontFamily: 'MBCorpoSTitle' }}>NUR FÜR DIE HOSTESS AM SCHALTER:</p>
                <button
                  className="mb-btn"
                  style={{ width: '100%', background: giveawayClaimed ? '#737373' : '#1CA0FF', fontSize: '1rem', padding: '0.8rem' }}
                  onClick={() => setGiveawayClaimed(!giveawayClaimed)}
                >
                  {giveawayClaimed ? 'GIVEAWAY EINGELÖST' : 'ALS EINGELÖST MARKIEREN'}
                </button>
              </div>
            </div>

            {/* Bottom Button matching Frame 4 - Starke Leistung.png */}
            <button
              className="mb-btn"
              style={{ width: '100%', padding: '1.2rem', fontSize: '1.3rem', marginTop: '1rem' }}
              onClick={() => {
                clearStoredSession();
                window.location.reload();
              }}
            >
              ZURÜCK ZUM START
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
