import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from './socket.js';

export default function HostView({ navigate }) {
  const [step, setStep] = useState('title'); // 'title' | 'language' | 'game'
  const [mode, setMode] = useState('standard'); // 'standard' (10) | 'express' (5)
  const [language, setLanguage] = useState('DE'); // 'DE' | 'EN'
  const [roomState, setRoomState] = useState(null);

  // Triple-tap on Mercedes logo refs
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  useEffect(() => {
    const handleRoomState = (state) => {
      setRoomState(state);
      if (state && (state.status === 'title' || state.status === 'lobby' && !state.playerCount)) {
        if (state.status === 'title') {
          setStep('title');
        }
      }
    };

    socket.on('room_state', handleRoomState);
    return () => socket.off('room_state', handleRoomState);
  }, []);

  const handleStartSession = (selectedLang) => {
    setLanguage(selectedLang);
    const customCode = `ROOM_${Math.floor(1000 + Math.random() * 9000)}`;
    socket.emit('create_room', { roomId: customCode, mode, language: selectedLang }, (response) => {
      if (response && response.success) {
        setRoomState(response.state);
        setStep('game');
      }
    });
  };

  const handleStartQuizNow = () => {
    if (roomState?.roomId) {
      socket.emit('start_quiz', { roomId: roomState.roomId });
    }
  };

  const handleNextQuestion = () => {
    if (roomState?.roomId) {
      socket.emit('next_question', { roomId: roomState.roomId });
    }
  };

  // Triple-tap handler for Hostess Quick-Reset on Mercedes Star Logo
  const handleLogoTripleTap = () => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 600) {
      tapCountRef.current += 1;
    } else {
      tapCountRef.current = 1;
    }
    lastTapTimeRef.current = now;

    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      if (roomState?.roomId) {
        socket.emit('reset_room', { roomId: roomState.roomId });
      }
      setRoomState(null);
      setStep('title');
      alert('Hostess Quick-Reset (3-Tap Stern): Zurück zum Startbildschirm.');
    }
  };

  const mobileUrl = roomState?.roomId
    ? `${window.location.origin}/mobile?room=${roomState.roomId}`
    : '';

  const sortedPlayers = roomState?.players
    ? [...roomState.players].sort((a, b) => b.score - a.score)
    : [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: '#ffffff' }}>
      {/* Persistent Top-Right Mercedes-Benz Star Logo (Clickable 3x to Reset anywhere) */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '2.5rem', zIndex: 500 }}>
        <img
          src="/logo.svg"
          alt="Mercedes-Benz Logo"
          onClick={handleLogoTripleTap}
          style={{
            height: '75px',
            cursor: 'pointer',
            filter: step === 'title' ? 'brightness(0) invert(1)' : 'none',
            transition: 'filter 0.2s ease'
          }}
          title="3x schnell tippen für Hostess Quick-Reset"
        />
      </div>

      {/* Option B: 30-Second Empty Room Grace Timer Overlay */}
      {roomState?.isEmptyRoomGrace && (
        <div className="mb-timer-overlay">
          <div style={{ background: '#000000', border: '3px solid #737373', padding: '3rem 4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <h2 style={{ fontSize: '2.2rem', marginBottom: '1rem', letterSpacing: '1px', color: '#ffffff', fontFamily: 'MBCorpoSTitle' }}>
              KEINE SPIELER IM RAUM!
            </h2>
            <p style={{ fontSize: '1.3rem', color: '#1CA0FF', marginBottom: '2rem', fontFamily: 'MBCorpoSTitle', fontWeight: 'bold' }}>
              Warte auf Wiederverbindung... Auto-Reset in {roomState.emptyRoomTimerSeconds}S
            </p>
            <button className="mb-btn" onClick={() => { socket.emit('reset_room', { roomId: roomState.roomId }); setStep('title'); }}>
              SOFORT ZURÜCKSETZEN
            </button>
          </div>
        </div>
      )}

      {/* STAGE 1: TITLE SLIDE (`slide_title.png`) */}
      {step === 'title' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundImage: `url('/Title.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            padding: '2.5rem 3rem'
          }}
        >
          {/* Spacer for top persistent logo */}
          <div style={{ height: '75px' }} />

          {/* Center Black Box "QUIZ" */}
          <div style={{ background: '#000000', padding: '2rem 5rem', margin: 'auto 0' }}>
            <h1 style={{ color: '#ffffff', fontSize: '6rem', letterSpacing: '4px', margin: 0, fontFamily: 'MBCorpoSTitle' }}>QUIZ</h1>
          </div>

          {/* Bottom START Button */}
          <div style={{ marginBottom: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <button className="mb-btn" style={{ minWidth: '260px', padding: '1.2rem 3rem', fontSize: '1.6rem' }} onClick={() => setStep('language')}>
              START
            </button>
            
            <button className="mb-btn mb-btn-secondary" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }} onClick={() => navigate('/mobile')}>
              Switch to Mobile View Demo
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2: LANGUAGE SELECTION SLIDE (`slide_language.png`) */}
      {step === 'language' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
          <div className="slide-header">
            <button className="mb-btn mb-btn-outline" style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }} onClick={() => setStep('title')}>
              ← Back
            </button>
            <div style={{ width: '75px' }} />
          </div>

          <div className="slide-container">
            <h1 style={{ fontSize: '3.5rem', marginBottom: '0.75rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>SPRACHE WÄHLEN</h1>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '3rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>CHOOSE YOUR LANGUAGE</h2>

            {/* Quiz Mode Selector */}
            <div style={{ marginBottom: '3rem' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.75rem', fontSize: '1.1rem', fontFamily: 'MBCorpoSTitle' }}>QUIZ MODUS:</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  className={`mb-btn ${mode === 'standard' ? '' : 'mb-btn-outline'}`}
                  style={{ fontSize: '1rem', padding: '0.6rem 1.5rem' }}
                  onClick={() => setMode('standard')}
                >
                  Standard (10 Fragen)
                </button>
                <button
                  className={`mb-btn ${mode === 'express' ? '' : 'mb-btn-outline'}`}
                  style={{ fontSize: '1rem', padding: '0.6rem 1.5rem' }}
                  onClick={() => setMode('express')}
                >
                  Express (5 Fragen)
                </button>
              </div>
            </div>

            {/* Language Start Buttons (Matching slide_language.png DEUTSCH & ENGLISCH) */}
            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center' }}>
              <button className="mb-btn" style={{ padding: '1.25rem 3.5rem', fontSize: '1.5rem' }} onClick={() => handleStartSession('DE')}>
                DEUTSCH
              </button>
              <button className="mb-btn" style={{ padding: '1.25rem 3.5rem', fontSize: '1.5rem' }} onClick={() => handleStartSession('EN')}>
                ENGLISCH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: ACTIVE GAME SLIDES (Lobby, Questions, Feedback, Leaderboard) */}
      {step === 'game' && roomState && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
          <div className="slide-header">
            <span style={{ fontSize: '1.2rem', fontFamily: 'MBCorpoSTitle', fontWeight: 'bold' }}>
              MERCEDES-BENZ QUIZ ({roomState.language}) - {roomState.mode.toUpperCase()} MODUS
            </span>
            <div style={{ width: '75px' }} />
          </div>

          {/* SCREEN 1: QR Code Lobby (`slide_qr.png`) */}
          {roomState.status === 'lobby' && (
            <div className="slide-container">
              <h1 style={{ fontSize: '4rem', marginBottom: '2.5rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>LOS GEHT´S!</h1>

              {/* Clean Blue QR Code directly on white background without box */}
              <div style={{ marginBottom: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <QRCodeSVG value={mobileUrl} fgColor="#1CA0FF" bgColor="transparent" size={280} />
                <p style={{ color: '#000000', fontWeight: 'bold', marginTop: '1.5rem', fontSize: '1.3rem', fontFamily: 'MBCorpoSTitle' }}>
                  {window.location.host}/mobile?room={roomState.roomId}
                </p>
              </div>

              {/* Player Count & Start Button */}
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2.2rem', marginBottom: '1.5rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>
                  VERBUNDENE SPIELER: {roomState.playerCount} / {roomState.maxPlayers}
                </h2>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
                  {roomState.players.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background: '#1CA0FF',
                        color: '#ffffff',
                        padding: '0.75rem 1.5rem',
                        fontFamily: 'MBCorpoSTitle',
                        fontSize: '1.2rem',
                        fontWeight: 'bold'
                      }}
                    >
                      {p.nickname} {p.disconnected ? '(Disconnected)' : ''}
                    </div>
                  ))}
                </div>

                <button
                  className="mb-btn"
                  style={{ padding: '1.2rem 3.5rem', fontSize: '1.5rem' }}
                  disabled={roomState.playerCount === 0}
                  onClick={handleStartQuizNow}
                >
                  QUIZ JETZT STARTEN
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 3: Question Slide (`slide_question.png`) */}
          {roomState.status === 'question' && (
            <div className="slide-container" style={{ justifyContent: 'flex-start', paddingTop: '2rem' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <span style={{ fontFamily: 'MBCorpoSTitle', fontSize: '1.3rem', fontWeight: 'bold' }}>
                  FRAGE {roomState.currentQuestionIndex + 1} VON {roomState.totalQuestions}
                </span>
                <span style={{ fontFamily: 'MBCorpoSTitle', fontSize: '1.6rem', fontWeight: 'bold', color: '#1CA0FF' }}>
                  {roomState.timerSeconds}S
                </span>
              </div>

              {/* Countdown Progress Bar in Mercedes Blue #1CA0FF */}
              <div style={{ width: '100%', height: '10px', background: '#e5e5e5', marginBottom: '3rem' }}>
                <div
                  style={{
                    height: '100%',
                    background: '#1CA0FF',
                    width: `${(roomState.timerSeconds / 15) * 100}%`,
                    transition: 'width 1s linear'
                  }}
                />
              </div>

              <h1 style={{ fontSize: '2.8rem', marginBottom: '3.5rem', lineHeight: '1.3', fontFamily: 'MBCorpoSTitle', color: '#000000' }}>
                {roomState.currentQuestion?.questionText}
              </h1>

              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                {roomState.currentQuestion?.options.map((opt, idx) => (
                  <div key={idx} className="mb-option-btn">
                    <span><strong>{String.fromCharCode(65 + idx)}:</strong> {opt}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: '#f5f5f5', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', width: '100%', fontFamily: 'MBCorpoSTitle' }}>
                <span>ANTWORTEN EINGEGANGEN: <strong>{roomState.answersReceivedCount} / {roomState.playerCount}</strong></span>
                <span style={{ color: '#737373' }}>AUTOMATISCHE WEITERLEITUNG</span>
              </div>
            </div>
          )}

          {/* SCREEN 4: Question Resolution Slide with Prominent Overlay Circular Timer */}
          {roomState.status === 'feedback' && (
            <div className="slide-container" style={{ justifyContent: 'flex-start', paddingTop: '2rem', position: 'relative' }}>
              {/* Prominent Overlay Graphic with Circular Countdown */}
              <div className="mb-timer-overlay">
                <div style={{ background: '#000000', border: '3px solid #1CA0FF', padding: '3rem 4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                  <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', letterSpacing: '2px', color: '#ffffff', fontFamily: 'MBCorpoSTitle' }}>
                    NÄCHSTE FRAGE STARTET IN
                  </h2>

                  {/* Circular SVG Countdown Ring */}
                  <div className="mb-circular-timer-container">
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
                    <div className="mb-circular-number">{roomState.feedbackTimerSeconds}</div>
                  </div>

                  <p style={{ color: '#1CA0FF', fontFamily: 'MBCorpoSTitle', fontSize: '1.2rem', marginBottom: '1.5rem', fontWeight: 'bold' }}>
                    RICHTIGE ANTWORT: {roomState.currentQuestion?.options[roomState.currentQuestion.correctAnswerIndex]}
                  </p>

                  <button className="mb-btn" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem' }} onClick={handleNextQuestion}>
                    JETZT WEITERLEITEN
                  </button>
                </div>
              </div>

              {/* Background resolution view */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', opacity: 0.3 }}>
                <span style={{ fontFamily: 'MBCorpoSTitle', fontSize: '1.4rem', color: '#1CA0FF', fontWeight: 'bold' }}>
                  AUFLÖSUNG
                </span>
              </div>

              <h2 style={{ fontSize: '2.5rem', marginBottom: '2.5rem', lineHeight: '1.3', fontFamily: 'MBCorpoSTitle', opacity: 0.3 }}>
                {roomState.currentQuestion?.questionText}
              </h2>

              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem', opacity: 0.3 }}>
                {roomState.currentQuestion?.options.map((opt, idx) => {
                  const isCorrect = idx === roomState.currentQuestion.correctAnswerIndex;
                  return (
                    <div key={idx} className={`mb-option-btn ${isCorrect ? 'correct' : 'incorrect'}`}>
                      <span><strong>{String.fromCharCode(65 + idx)}:</strong> {opt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SCREEN 5: End Ranking Slide (`slide_end.png` with official Pokal.svg) */}
          {roomState.status === 'leaderboard' && (
            <div className="slide-container">
              {/* Pokal SVG Graphic */}
              <div style={{ marginBottom: '1.5rem' }}>
                <img src="/Pokal.svg" alt="Mercedes-Benz Pokal" style={{ height: '160px' }} />
              </div>

              <h1 style={{ fontSize: '3.8rem', marginBottom: '0.5rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>STARKE LEISTUNG!</h1>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>
                Hol dir jetzt dein Giveaway
              </h2>
              <h2 style={{ fontSize: '1.8rem', marginBottom: '2.5rem', color: '#000000', fontFamily: 'MBCorpoSTitle' }}>
                Schalter ab.
              </h2>

              <div style={{ width: '100%', maxWidth: '750px', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                {sortedPlayers.map((p, idx) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1.25rem 2rem',
                      background: idx === 0 ? '#1CA0FF' : idx === 1 ? '#000000' : '#737373',
                      color: '#ffffff',
                      fontFamily: 'MBCorpoSTitle',
                      fontSize: '1.5rem',
                      fontWeight: 'bold'
                    }}
                  >
                    <span>
                      {idx + 1}. PLATZ - {p.nickname}
                    </span>
                    <span>{p.score} PKT</span>
                  </div>
                ))}
              </div>

              {/* Bottom Right Button matching slide_end.png */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="mb-btn" style={{ padding: '1.2rem 3rem', fontSize: '1.5rem' }} onClick={() => { setRoomState(null); setStep('title'); }}>
                  ZURÜCK ZUM START
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
