// js/music.js
// Lecteur de musique d'ambiance. Module autonome : ne dépend que d'éléments
// du DOM et de l'API Audio du navigateur, aucun lien avec les données projet.

export function setupMusicPlayer() {
  const audio = new Audio();
  let playlist = [];
  let currentTrackIndex = 0;

  const btnLoadMusic = document.getElementById('btnLoadMusic');
  const musicInput = document.getElementById('musicInput');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnPrevTrack = document.getElementById('btnPrevTrack');
  const btnNextTrack = document.getElementById('btnNextTrack');
  const trackName = document.getElementById('trackName');

  btnLoadMusic.onclick = () => musicInput.click();

  musicInput.onchange = (e) => {
    playlist = Array.from(e.target.files);
    if (playlist.length > 0) {
      currentTrackIndex = 0;
      playTrack();
    }
  };

  function playTrack() {
    if (!playlist[currentTrackIndex]) return;
    audio.src = URL.createObjectURL(playlist[currentTrackIndex]);
    audio.play();
    trackName.textContent = playlist[currentTrackIndex].name;
    btnPlayPause.textContent = '⏸';
  }

  btnPlayPause.onclick = () => {
    if (!audio.src) return;
    if (audio.paused) { audio.play(); btnPlayPause.textContent = '⏸'; }
    else { audio.pause(); btnPlayPause.textContent = '▶'; }
  };

  btnPrevTrack.onclick = () => {
    if (playlist.length === 0) return;
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    playTrack();
  };

  btnNextTrack.onclick = () => {
    if (playlist.length === 0) return;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playTrack();
  };

  audio.addEventListener('ended', () => btnNextTrack.click());
}
