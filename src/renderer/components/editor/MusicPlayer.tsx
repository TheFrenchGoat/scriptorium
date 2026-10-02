// src/renderer/components/editor/MusicPlayer.tsx
// Lecteur de musique d'ambiance. Composant autonome : ne dépend que de l'API
// Audio du navigateur, aucun lien avec les données projet.
//
// `playlistRef`/`indexRef` dupliquent volontairement le state React : le
// listener 'ended' est posé une seule fois sur l'élément <audio> (créé une
// seule fois, à vie), donc une fermeture sur `playlist`/`currentIndex` figerait
// leurs valeurs au premier rendu. Les refs, elles, sont toujours à jour.

import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

export function MusicPlayer(): React.ReactElement {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playlistRef = useRef<File[]>([]);
  const indexRef = useRef(0);

  const [playlist, setPlaylistState] = useState<File[]>([]);
  const [currentIndex, setCurrentIndexState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const setPlaylist = (list: File[]) => {
    playlistRef.current = list;
    setPlaylistState(list);
  };
  const setCurrentIndex = (index: number) => {
    indexRef.current = index;
    setCurrentIndexState(index);
  };

  const playAt = (index: number) => {
    const audio = audioRef.current;
    const file = playlistRef.current[index];
    if (!audio || !file) return;
    audio.src = URL.createObjectURL(file);
    void audio.play();
    setIsPlaying(true);
  };

  const goToNext = () => {
    const list = playlistRef.current;
    if (list.length === 0) return;
    const next = (indexRef.current + 1) % list.length;
    setCurrentIndex(next);
    playAt(next);
  };

  // Comportement standard des lecteurs de musique (Spotify, YouTube Music...) :
  // un premier appui sur "Précédent" remet simplement la piste en cours au
  // début ; ce n'est qu'un second appui rapproché (piste déjà proche de son
  // début) qui fait réellement reculer à la piste antérieure. Sans ce garde-
  // fou, il devient quasi impossible de "revenir en arrière de quelques
  // secondes" sans sauter accidentellement deux pistes en arrière.
  const RESTART_THRESHOLD_SECONDS = 3;

  const goToPrev = () => {
    const audio = audioRef.current;
    const list = playlistRef.current;
    if (list.length === 0 || !audio) return;

    if (audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0;
      return;
    }

    const prev = (indexRef.current - 1 + list.length) % list.length;
    setCurrentIndex(prev);
    playAt(prev);
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onEnded = () => goToNext();
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPlaylist(files);
    setCurrentIndex(0);
    playAt(0);
  };

  const currentTrackName = playlist[currentIndex]?.name;

  return (
    <div className="music-controls">
      <input
        type="file"
        id="musicInput"
        multiple
        accept="audio/*"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={onFilesChosen}
      />
      <button
        className="music-btn"
        id="btnLoadMusic"
        title={t('loadMusicTitle')}
        onClick={() => fileInputRef.current?.click()}
      >
        📁
      </button>
      <button className="music-btn" id="btnPrevTrack" title={t('prevTrackTitle')} onClick={goToPrev}>
        ⏮
      </button>
      <button className="music-btn" id="btnPlayPause" title={t('playPauseTitle')} onClick={togglePlayPause}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="music-btn" id="btnNextTrack" title={t('nextTrackTitle')} onClick={goToNext}>
        ⏭
      </button>
      <span id="trackName" className="music-info">
        {currentTrackName || t('noTrack')}
      </span>
    </div>
  );
}
