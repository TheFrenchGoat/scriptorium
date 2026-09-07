// js/timer.js
// Minuteur d'écriture (Pomodoro et durées libres). Module totalement autonome :
// il ne touche ni aux projets, ni aux chapitres, seulement à ses propres
// éléments du DOM. Il peut donc être testé/modifié indépendamment du reste.

export function setupTimer() {
  let timerInterval = null;
  let timeRemaining = 0;
  let isTimerRunning = false;

  const btnTimer = document.getElementById('btnTimer');
  const btnTimerPause = document.getElementById('btnTimerPause');
  const btnTimerStop = document.getElementById('btnTimerStop');

  btnTimer.onclick = () => {
    if (!isTimerRunning && timeRemaining === 0) {
      document.getElementById('timerModal').style.display = 'flex';
    } else if (timeRemaining > 0 && !isTimerRunning) {
      startTimer();
    }
  };

  document.getElementById('cancelTimer').onclick = () => {
    document.getElementById('timerModal').style.display = 'none';
  };

  document.getElementById('confirmTimer').onclick = () => {
    const mins = parseInt(document.getElementById('timerDurationValue').value, 10);
    timeRemaining = mins * 60;
    startTimer();
    document.getElementById('timerModal').style.display = 'none';
  };

  document.querySelectorAll('.timer-option').forEach(opt => {
    opt.tabIndex = 0;
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.click(); }
    });
    opt.onclick = () => {
      document.getElementById('timerDurationValue').value = opt.dataset.value;
      document.getElementById('timerDropdownBtn').textContent = opt.textContent + ' ▾';
      document.getElementById('timerDropdownBtn').nextElementSibling.classList.remove('show');
    };
  });

  function startTimer() {
    isTimerRunning = true;
    btnTimerPause.style.display = 'inline-block';
    btnTimerStop.style.display = 'inline-block';
    btnTimerPause.textContent = '⏸';

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (timeRemaining <= 0) { stopTimer(); alert('Fini !'); return; }
      timeRemaining--;
      updateTimerUI();
    }, 1000);
  }

  function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    isTimerRunning = false;
  }

  btnTimerPause.onclick = () => {
    if (isTimerRunning) {
      pauseTimer();
      btnTimerPause.textContent = '▶';
    } else {
      startTimer();
    }
  };

  function stopTimer() {
    pauseTimer();
    timeRemaining = 0;
    btnTimerPause.style.display = 'none';
    btnTimerStop.style.display = 'none';
    btnTimer.textContent = '⏱ Timer';
    btnTimer.classList.remove('running');
  }
  btnTimerStop.onclick = () => { stopTimer(); };

  function updateTimerUI() {
    if (timeRemaining === 0) return;
    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    btnTimer.textContent = `⏱ ${m}:${s}`;
    btnTimer.classList.add('running');
  }
}
