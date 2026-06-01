// App.js - Predichess Web Controller
// Real-time Firestore sync and board interaction mirroring Android styling
// Fully aligned with the APK features including Offline Bot Game and Pass & Play

import { 
  ChessBoard, 
  PieceColor, 
  PieceType, 
  GameResult, 
  ChessMove 
} from './chess.js';

import { BotEngine } from './bot.js';

// --- FIREBASE IMPORT CDN (Modular SDK) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  addDoc, 
  runTransaction, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyB9QNdGcA0Mk83WbBCNnP8WOm1yFveK1Cc",
  authDomain: "deltachess-151a5.firebaseapp.com",
  projectId: "deltachess-151a5",
  storageBucket: "deltachess-151a5.firebasestorage.app",
  messagingSenderId: "595116332112",
  appId: "1:595116332112:web:fabc72220006efa9792d55"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL STATE ---
let currentUser = null;
let currentUid = null;
let currentUsername = "";

let activeGameId = null;
let activeGame = null;
let gameListener = null;

let activeBoard = new ChessBoard();
let isFlipped = false;
let myColor = PieceColor.WHITE;

let reviewIndex = -1; 
let selSquare = null; 
let legalTargets = []; 
let promotionPendingMove = null; 

let friendRequestsListener = null;
let openGamesListener = null;

// Offline play state
let isOfflineGame = false;
let offlineGameData = null;
let isBotThinking = false;

// --- NAVIGATION & SCREEN ROUTING ---
const screens = {
  login: document.getElementById('screen-login'),
  username: document.getElementById('screen-username'),
  dashboard: document.getElementById('screen-dashboard'),
  game: document.getElementById('screen-game'),
  help: document.getElementById('screen-help')
};

function showScreen(screenId) {
  // Clear any bot thinking flags when leaving game room
  if (screenId !== 'game') {
    isBotThinking = false;
  }

  Object.keys(screens).forEach(key => {
    if (key === screenId) {
      screens[key].style.display = 'flex';
      setTimeout(() => screens[key].classList.add('active'), 50);
    } else {
      screens[key].classList.remove('active');
      screens[key].style.display = 'none';
    }
  });

  if (screenId !== 'game') {
    if (gameListener) {
      gameListener();
      gameListener = null;
    }
    activeGameId = null;
    activeGame = null;
    isOfflineGame = false;
    offlineGameData = null;
  }
}

// --- DYNAMIC ALERT DIALOGS & TOASTS ---
function showDialog(title, message, buttons = []) {
  const dialog = document.getElementById('global-dialog');
  const dTitle = document.getElementById('dialog-title');
  const dMessage = document.getElementById('dialog-message');
  const dButtons = document.getElementById('dialog-buttons');

  dTitle.textContent = title;
  dMessage.innerHTML = message;
  dButtons.innerHTML = '';

  if (buttons.length === 0) {
    buttons = [{ text: 'OK', type: 'confirm', action: () => dialog.classList.remove('active') }];
  }

  buttons.forEach(btn => {
    const el = document.createElement('button');
    el.className = `btn-dialog ${btn.type === 'confirm' ? 'btn-dialog-confirm' : btn.type === 'danger' ? 'btn-dialog-danger' : 'btn-dialog-cancel'}`;
    el.textContent = btn.text;
    el.addEventListener('click', () => {
      dialog.classList.remove('active');
      if (btn.action) btn.action();
    });
    dButtons.appendChild(el);
  });

  dialog.classList.add('active');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('global-toast');
  const tIcon = document.getElementById('toast-icon');
  const tMessage = document.getElementById('toast-message');

  tMessage.textContent = message;
  toast.className = 'toast';

  if (type === 'success') {
    toast.classList.add('toast-success');
    tIcon.className = 'fa-solid fa-circle-check';
  } else if (type === 'error') {
    toast.classList.add('toast-error');
    tIcon.className = 'fa-solid fa-circle-exclamation';
  } else {
    tIcon.className = 'fa-solid fa-circle-info';
  }

  toast.classList.add('active');
  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// --- AUTH & PROFILE MANAGER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    await checkUserProfile();
  } else {
    currentUid = null;
    currentUser = null;
    currentUsername = "";
    cleanupListeners();
    showScreen('login');
  }
});

async function checkUserProfile() {
  try {
    const userDocRef = doc(db, 'users', currentUid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      currentUser = userDoc.data();
      currentUsername = currentUser.username;
      
      document.getElementById('user-display-name').textContent = currentUsername;

      setupDashboardListeners();
      showScreen('dashboard');
    } else {
      showScreen('username');
    }
  } catch (e) {
    showToast('Failed to check user profile.', 'error');
  }
}

// Claim username logic
document.getElementById('btn-submit-username').addEventListener('click', async () => {
  const input = document.getElementById('username-input');
  const username = input.value.trim();
  const errorDiv = document.getElementById('username-error');

  if (!username) return;
  if (username.length < 3 || username.length > 20) {
    errorDiv.textContent = "Username must be between 3 and 20 characters.";
    errorDiv.style.display = "block";
    return;
  }

  const btn = document.getElementById('btn-submit-username');
  btn.disabled = true;
  errorDiv.style.display = "none";

  try {
    const success = await runTransaction(db, async (transaction) => {
      const usernameRef = doc(db, 'usernames', username.toLowerCase());
      const userRef = doc(db, 'users', currentUid);

      const usernameDoc = await transaction.get(usernameRef);
      if (usernameDoc.exists()) {
        return false;
      }

      transaction.set(usernameRef, { uid: currentUid });
      transaction.set(userRef, {
        username: username,
        openGames: []
      });
      return true;
    });

    if (success) {
      showToast('Profile registered successfully!', 'success');
      await checkUserProfile();
    } else {
      errorDiv.textContent = "Username is already taken.";
      errorDiv.style.display = "block";
      btn.disabled = false;
    }
  } catch (e) {
    showToast('Error registering handle.', 'error');
    btn.disabled = false;
  }
});

// Login button listener
document.getElementById('btn-google-login').addEventListener('click', () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch((error) => {
    showToast('Google sign-in failed.', 'error');
  });
});

// Logout listener
document.getElementById('btn-dashboard-logout').addEventListener('click', () => {
  showDialog('LOGOUT', 'Are you sure you want to end your session?', [
    { text: 'Logout', type: 'danger', action: () => signOut(auth) },
    { text: 'Cancel', type: 'cancel' }
  ]);
});

// Help buttons
document.getElementById('btn-dashboard-help').addEventListener('click', () => showScreen('help'));
document.getElementById('btn-help-back').addEventListener('click', () => showScreen('dashboard'));

// --- LOBBY & FRIENDS REALTIME LISTENERS ---
function setupDashboardListeners() {
  cleanupListeners();
  updateOfflineButtonLabels();

  // 1. Listen to incoming friend requests
  const reqQuery = collection(db, 'users', currentUid, 'incomingRequests');
  friendRequestsListener = onSnapshot(reqQuery, (snapshot) => {
    const requestsList = document.getElementById('incoming-requests-list');
    requestsList.innerHTML = '';
    const pendingHeader = document.getElementById('header-pending');

    if (snapshot.empty) {
      pendingHeader.style.display = 'none';
      return;
    }

    pendingHeader.style.display = 'block';
    snapshot.forEach(docSnap => {
      const fromUid = docSnap.id;
      const data = docSnap.data();
      
      const item = document.createElement('div');
      item.className = 'request-item';
      item.innerHTML = `
        <span class="friend-name">${data.fromUsername}</span>
        <div class="request-actions">
          <button class="btn-outlined-white-small btn-accept" data-uid="${fromUid}">ACCEPT</button>
          <button class="btn-outlined-gray-small btn-reject" data-uid="${fromUid}">REJECT</button>
        </div>
      `;

      item.querySelector('.btn-accept').addEventListener('click', () => acceptFriend(fromUid));
      item.querySelector('.btn-reject').addEventListener('click', () => rejectFriend(fromUid));
      requestsList.appendChild(item);
    });
  });

  // 2. Listen to profile updates (for friends list & open games)
  const userDocRef = doc(db, 'users', currentUid);
  openGamesListener = onSnapshot(userDocRef, async (docSnap) => {
    if (!docSnap.exists()) return;
    currentUser = docSnap.data();

    // Render Friends List
    const friendsListDiv = document.getElementById('friends-list');
    friendsListDiv.innerHTML = '';
    const friends = currentUser.friends || [];

    if (friends.length === 0) {
      friendsListDiv.innerHTML = `
        <div class="empty-state">
          <p>No friends added yet</p>
        </div>
      `;
    } else {
      for (const fUid of friends) {
        const fDoc = await getDoc(doc(db, 'users', fUid));
        if (fDoc.exists()) {
          const fData = fDoc.data();
          const item = document.createElement('div');
          item.className = 'friend-item';
          item.innerHTML = `
            <div class="friend-info">
              <span class="friend-name">${fData.username}</span>
            </div>
            <div class="friend-actions">
              <button class="btn-outlined-white-small btn-challenge" data-uid="${fUid}">CHALLENGE</button>
            </div>
          `;
          item.querySelector('.btn-challenge').addEventListener('click', () => {
            challengeFriend(fUid, fData.username);
          });
          friendsListDiv.appendChild(item);
        }
      }
    }

    // Render Active Games List (OPEN GAMES)
    const gamesListDiv = document.getElementById('open-games-list');
    gamesListDiv.innerHTML = '';
    const openGames = currentUser.openGames || [];
    let activeGamesCount = 0;

    for (const gameId of openGames) {
      const gDoc = await getDoc(doc(db, 'games', gameId));
      if (gDoc.exists()) {
        const gData = gDoc.data();
        if (gData.status === 'active') {
          activeGamesCount++;
          const opponentName = gData.whiteUid === currentUid ? gData.blackUsername : gData.whiteUsername;
          const myTurn = (gData.currentTurn === 'white' && gData.whiteUid === currentUid) ||
                         (gData.currentTurn === 'black' && gData.blackUid === currentUid);

          const item = document.createElement('div');
          item.className = 'game-item';
          item.innerHTML = `
            <div class="game-item-info">
              <div class="game-item-avatar">♞</div>
              <div>
                <div class="game-item-opponent">${opponentName}</div>
                <div class="game-item-meta">Predichess Match</div>
              </div>
            </div>
            <span class="badge ${myTurn ? 'badge-your-turn' : 'badge-waiting'}">${myTurn ? 'YOUR TURN' : 'WAITING'}</span>
          `;
          item.addEventListener('click', () => enterGame(gameId));
          gamesListDiv.appendChild(item);
        }
      }
    }

    if (activeGamesCount === 0) {
      gamesListDiv.innerHTML = `
        <div class="empty-state">
          <p>No active games</p>
        </div>
      `;
    }
  });
}

function cleanupListeners() {
  if (friendRequestsListener) friendRequestsListener();
  if (openGamesListener) openGamesListener();
  friendRequestsListener = null;
  openGamesListener = null;
}

// TAB MANAGEMENT IN DASHBOARD
const tabPlay = document.getElementById('tab-play');
const tabFriends = document.getElementById('tab-friends');
const panePlay = document.getElementById('pane-play');
const paneFriends = document.getElementById('pane-friends');

tabPlay.addEventListener('click', () => {
  tabPlay.classList.add('active');
  tabFriends.classList.remove('active');
  panePlay.classList.add('active');
  paneFriends.classList.remove('active');
  updateOfflineButtonLabels();
});

tabFriends.addEventListener('click', () => {
  tabFriends.classList.add('active');
  tabPlay.classList.remove('active');
  paneFriends.classList.add('active');
  panePlay.classList.remove('active');
});

// --- OFFLINE LAUNCHERS & LOGIC ---
function updateOfflineButtonLabels() {
  const botBtn = document.getElementById('btn-play-offline-bot');
  const passBtn = document.getElementById('btn-play-pass-play');

  if (botBtn) {
    const savedBot = localStorage.getItem('predichess_offline_bot');
    const isBotActive = savedBot && JSON.parse(savedBot).status === 'active';
    botBtn.textContent = isBotActive ? "RESUME BOT GAME" : "PLAY VS OFFLINE BOT";
  }

  if (passBtn) {
    const savedLocal = localStorage.getItem('predichess_local_pass_play');
    const isLocalActive = savedLocal && JSON.parse(savedLocal).status === 'active';
    passBtn.textContent = isLocalActive ? "RESUME PASS & PLAY" : "LOCAL PASS & PLAY";
  }
}

document.getElementById('btn-play-offline-bot').addEventListener('click', () => {
  const savedGame = localStorage.getItem('predichess_offline_bot');
  if (savedGame && JSON.parse(savedGame).status === 'active') {
    showDialog('Active Game Found', 'Would you like to resume your active bot game or start a new one?', [
      { text: 'Resume', type: 'confirm', action: () => startOfflineGame('offline_bot') },
      { text: 'New Game', type: 'danger', action: () => initNewOfflineGame('offline_bot') },
      { text: 'Cancel', type: 'cancel' }
    ]);
  } else {
    initNewOfflineGame('offline_bot');
  }
});

document.getElementById('btn-play-pass-play').addEventListener('click', () => {
  const savedGame = localStorage.getItem('predichess_local_pass_play');
  if (savedGame && JSON.parse(savedGame).status === 'active') {
    showDialog('Active Game Found', 'Would you like to resume your active pass & play game or start a new one?', [
      { text: 'Resume', type: 'confirm', action: () => startOfflineGame('local_pass_play') },
      { text: 'New Game', type: 'danger', action: () => initNewOfflineGame('local_pass_play') },
      { text: 'Cancel', type: 'cancel' }
    ]);
  } else {
    initNewOfflineGame('local_pass_play');
  }
});

function initNewOfflineGame(gameId) {
  const isBot = gameId === 'offline_bot';
  const newGame = {
    id: gameId,
    whiteUid: isBot ? "player" : "white",
    blackUid: isBot ? "bot" : "black",
    whiteUsername: isBot ? "You" : "White",
    blackUsername: isBot ? "Bot" : "Black",
    currentTurn: "white",
    phase: "move",
    events: [],
    predictions: [],
    pendingPrediction: "",
    status: "active",
    result: "ongoing"
  };
  localStorage.setItem('predichess_' + gameId, JSON.stringify(newGame));
  startOfflineGame(gameId);
}

function startOfflineGame(gameId) {
  isOfflineGame = true;
  activeGameId = gameId;
  reviewIndex = -1;
  selSquare = null;
  legalTargets = [];
  promotionPendingMove = null;

  // Unsubscribe from Firestore if active
  if (gameListener) {
    gameListener();
    gameListener = null;
  }

  offlineGameData = JSON.parse(localStorage.getItem('predichess_' + gameId));

  if (gameId === 'offline_bot') {
    myColor = PieceColor.WHITE;
    isFlipped = false;
  } else {
    myColor = offlineGameData.currentTurn === 'white' ? PieceColor.WHITE : PieceColor.BLACK;
    isFlipped = (myColor === PieceColor.BLACK);
  }

  document.getElementById('game-opponent-name').textContent = offlineGameData.blackUsername;
  document.getElementById('game-my-name').textContent = offlineGameData.whiteUsername;

  showScreen('game');
  renderGameRoom();

  // Resume bot action if it's the bot's turn to play/predict
  if (gameId === 'offline_bot' && offlineGameData.currentTurn === 'black' && offlineGameData.status === 'active') {
    triggerBotAction();
  }
}

function saveOfflineGame() {
  if (isOfflineGame && activeGameId && offlineGameData) {
    localStorage.setItem('predichess_' + activeGameId, JSON.stringify(offlineGameData));
  }
}

// --- ADD FRIEND & CHALLENGES (ONLINE) ---
document.getElementById('btn-add-friend').addEventListener('click', async () => {
  const input = document.getElementById('add-friend-input');
  const targetUsername = input.value.trim();

  if (!targetUsername || targetUsername.toLowerCase() === currentUsername.toLowerCase()) {
    showToast('Invalid handle request.', 'error');
    return;
  }

  try {
    const nameDoc = await getDoc(doc(db, 'usernames', targetUsername.toLowerCase()));
    if (!nameDoc.exists()) {
      showToast('Handle does not exist.', 'error');
      return;
    }

    const targetUid = nameDoc.data().uid;
    const reqRef = doc(db, 'users', targetUid, 'incomingRequests', currentUid);
    
    await setDoc(reqRef, {
      fromUsername: currentUsername,
      timestamp: serverTimestamp()
    });

    showToast('Friend request sent!', 'success');
    input.value = '';
  } catch (e) {
    showToast('Could not send friend request.', 'error');
  }
});

async function acceptFriend(fromUid) {
  try {
    const fromDoc = await getDoc(doc(db, 'users', fromUid));
    if (!fromDoc.exists()) return;
    const fromData = fromDoc.data();

    // Perform transaction to link friends
    await runTransaction(db, async (transaction) => {
      const myRef = doc(db, 'users', currentUid);
      const otherRef = doc(db, 'users', fromUid);
      const requestRef = doc(db, 'users', currentUid, 'incomingRequests', fromUid);

      transaction.update(myRef, { friends: arrayUnion(fromUid) });
      transaction.update(otherRef, { friends: arrayUnion(currentUid) });
      transaction.delete(requestRef);
    });

    showToast(`You are now friends with ${fromData.username}!`, 'success');
  } catch (_) {
    showToast('Error accepting request.', 'error');
  }
}

async function rejectFriend(fromUid) {
  try {
    await deleteDoc(doc(db, 'users', currentUid, 'incomingRequests', fromUid));
    showToast('Request dismissed.', 'info');
  } catch (_) {}
}

async function challengeFriend(friendUid, friendName) {
  showDialog('CHALLENGE', `Send match invitation to ${friendName}?`, [
    {
      text: 'Send Challenge',
      type: 'confirm',
      action: async () => {
        try {
          const gameRef = await addDoc(collection(db, 'games'), {
            whiteUid: currentUid,
            whiteUsername: currentUsername,
            blackUid: friendUid,
            blackUsername: friendName,
            currentTurn: 'white',
            phase: 'move',
            events: [],
            predictions: [],
            pendingPrediction: "",
            status: 'active',
            result: 'ongoing',
            timestamp: serverTimestamp()
          });

          const gameId = gameRef.id;

          const batch = writeBatch(db);
          batch.update(doc(db, 'users', currentUid), { openGames: arrayUnion(gameId) });
          batch.update(doc(db, 'users', friendUid), { openGames: arrayUnion(gameId) });
          await batch.commit();

          showToast('Challenge issued!', 'success');
          enterGame(gameId);
        } catch (e) {
          showToast('Failed to create match.', 'error');
        }
      }
    },
    { text: 'Cancel', type: 'cancel' }
  ]);
}

// --- ACTIVE PREDICHESS GAME CLIENT ---
function enterGame(gameId) {
  isOfflineGame = false;
  activeGameId = gameId;
  reviewIndex = -1;
  selSquare = null;
  legalTargets = [];
  promotionPendingMove = null;

  showScreen('game');

  gameListener = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
    if (!docSnap.exists()) return;
    activeGame = docSnap.data();

    myColor = activeGame.whiteUid === currentUid ? PieceColor.WHITE : PieceColor.BLACK;
    isFlipped = (myColor === PieceColor.BLACK);

    const opponentName = myColor === PieceColor.WHITE ? activeGame.blackUsername : activeGame.whiteUsername;
    document.getElementById('game-opponent-name').textContent = opponentName;
    document.getElementById('game-my-name').textContent = currentUsername;

    if (reviewIndex >= (activeGame.events || []).length) {
      reviewIndex = -1;
    }

    renderGameRoom();
  });
}

function renderGameRoom() {
  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  if (!sourceGame) return;

  const events = sourceGame.events || [];
  const eventsToApply = reviewIndex === -1 ? events : events.slice(0, reviewIndex + 1);
  activeBoard.applyMoves(eventsToApply);

  const gameRes = activeBoard.gameResult();
  if (gameRes !== GameResult.ONGOING && reviewIndex === -1) {
    selSquare = null;
    legalTargets = [];
    if (sourceGame.status === 'active') {
      if (isOfflineGame) {
        sourceGame.status = 'completed';
        sourceGame.result = gameRes === GameResult.CHECKMATE_WHITE_WINS ? 'white_wins' : 'black_wins';
        saveOfflineGame();
        showGameOverOffline(gameRes);
      } else {
        finalizeGameOnDB(gameRes);
      }
    }
  }

  drawChessBoardGrid();
  updateGameHUD(gameRes);
  populateMoveLog();
}

function drawChessBoardGrid() {
  const grid = document.getElementById('chess-board-grid');
  grid.innerHTML = '';

  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const inPredictPhase = (sourceGame.phase === 'predict');
  
  const isMyTurn = isOfflineGame ? 
    (activeGameId === 'offline_bot' ? (sourceGame.currentTurn === 'white') : true) :
    ((sourceGame.currentTurn === 'white' && sourceGame.whiteUid === currentUid) ||
     (sourceGame.currentTurn === 'black' && sourceGame.blackUid === currentUid));
  
  const effectiveFlipped = (reviewIndex === -1 && inPredictPhase && isMyTurn) ? !isFlipped : isFlipped;

  let checkSquare = null;
  if (reviewIndex === -1 && sourceGame.phase === 'move') {
    const turnColor = activeBoard.currentTurn;
    if (activeBoard.isInCheck(turnColor)) {
      checkSquare = activeBoard.findKing(turnColor);
    }
  }

  let lastFrom = null;
  let lastTo = null;
  let trapSq = null;

  const events = sourceGame.events || [];
  const eventsToApply = reviewIndex === -1 ? events : events.slice(0, reviewIndex + 1);

  if (eventsToApply.length > 0) {
    const lastEvent = eventsToApply[eventsToApply.length - 1];
    if (lastEvent.startsWith('trap:')) {
      trapSq = lastEvent.substring(5);
    } else {
      const parsed = activeBoard.parseUci(lastEvent);
      if (parsed) {
        lastFrom = { row: parsed.fromRow, col: parsed.fromCol };
        lastTo = { row: parsed.toRow, col: parsed.toCol };
      }
    }
  }

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    const row = effectiveFlipped ? 7 - rIdx : rIdx;
    
    for (let cIdx = 0; cIdx < 8; cIdx++) {
      const col = effectiveFlipped ? 7 - cIdx : cIdx;
      const cell = document.createElement('div');
      cell.className = 'chess-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;

      // Cell Colors
      const isDark = (row + col) % 2 === 1;
      cell.classList.add(isDark ? 'cell-dark' : 'cell-light');

      // Highlight Last Move
      if (lastFrom && lastFrom.row === row && lastFrom.col === col) cell.classList.add('cell-last-move');
      if (lastTo && lastTo.row === row && lastTo.col === col) cell.classList.add('cell-last-move');
      
      // Highlight Check
      if (checkSquare && checkSquare.row === row && checkSquare.col === col) cell.classList.add('cell-in-check');

      // Highlight Trap
      if (trapSq) {
        const tCol = trapSq.charCodeAt(0) - 'a'.charCodeAt(0);
        const tRow = 8 - parseInt(trapSq[1], 10);
        if (tRow === row && tCol === col) cell.classList.add('cell-trapped');
      }

      // Highlight Selection / Legal Actions
      if (selSquare && selSquare.row === row && selSquare.col === col) {
        cell.classList.add('cell-selected');
      }

      const isLegal = legalTargets.some(t => t.row === row && t.col === col);
      if (isLegal) {
        cell.classList.add('cell-legal-action');
        const dot = document.createElement('div');
        dot.className = activeBoard.squares[row][col] ? 'legal-dot-capture' : 'legal-dot';
        cell.appendChild(dot);
      }

      // Render Piece Graphics
      const piece = activeBoard.squares[row][col];
      if (piece) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'chess-piece-graphic';
        
        let canDrag = false;
        if (reviewIndex === -1) {
          if (!inPredictPhase && isMyTurn && piece.color === myColor) {
            canDrag = true;
          } else if (inPredictPhase && isMyTurn && piece.color !== myColor) {
            canDrag = true;
          }
        }

        if (canDrag) {
          pieceEl.draggable = true;
          pieceEl.classList.add(piece.color === myColor ? 'player-piece' : 'opponent-piece');
        } else {
          pieceEl.classList.add('non-interactive');
        }

        pieceEl.innerHTML = getPieceSvg(piece.type, piece.color);

        pieceEl.addEventListener('click', (e) => {
          if (reviewIndex !== -1) return;
          e.stopPropagation();

          if (!inPredictPhase && isMyTurn && piece.color === myColor) {
            selectSquare(row, col);
          } else if (inPredictPhase && isMyTurn && piece.color !== myColor) {
            selectSquare(row, col);
          }
        });

        pieceEl.addEventListener('dragstart', (e) => {
          if (reviewIndex !== -1) return;
          e.dataTransfer.setData('text/plain', JSON.stringify({ row: row, col: col }));
          setTimeout(() => pieceEl.classList.add('dragging'), 0);
          selectSquare(row, col);
        });

        pieceEl.addEventListener('dragend', () => {
          pieceEl.classList.remove('dragging');
        });

        cell.appendChild(pieceEl);
      }

      cell.addEventListener('click', () => {
        if (reviewIndex !== -1) return;
        if (isLegal) {
          executeSelectionMove(row, col);
        } else {
          selSquare = null;
          legalTargets = [];
          drawChessBoardGrid();
        }
      });

      cell.addEventListener('dragover', (e) => e.preventDefault());
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        if (reviewIndex !== -1) return;
        
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data && isLegal && cell.dataset.row == row && cell.dataset.col == col) {
            executeSelectionMove(row, col);
          }
        } catch (_) {}
      });

      grid.appendChild(cell);
    }
  }
}

function selectSquare(row, col) {
  if (reviewIndex !== -1) return;
  selSquare = { row, col };
  legalTargets = activeBoard.legalMovesFrom(row, col).map(m => ({ row: m.toRow, col: m.toCol }));
  drawChessBoardGrid();
}

function executeSelectionMove(toRow, toCol) {
  if (!selSquare) return;

  const validMoves = activeBoard.legalMovesFrom(selSquare.row, selSquare.col)
    .filter(m => m.toRow === toRow && m.toCol === toCol);

  if (validMoves.length === 0) return;
  const move = validMoves[0];

  if (move.promotion !== null) {
    promotionPendingMove = move;
    openPromotionModal();
  } else {
    submitTacticalMove(move.toUci());
  }
}

function openPromotionModal() {
  const overlay = document.getElementById('promotion-dialog');
  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const promoColor = (sourceGame.phase === 'predict') ? activeBoard.opponent(myColor) : myColor;

  document.getElementById('promo-q').innerHTML = getPieceSvg(PieceType.QUEEN, promoColor);
  document.getElementById('promo-r').innerHTML = getPieceSvg(PieceType.ROOK, promoColor);
  document.getElementById('promo-b').innerHTML = getPieceSvg(PieceType.BISHOP, promoColor);
  document.getElementById('promo-n').innerHTML = getPieceSvg(PieceType.KNIGHT, promoColor);

  overlay.classList.add('active');
}

// BIND PROMOTION OPTIONS
['promo-q', 'promo-r', 'promo-b', 'promo-n'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    if (!promotionPendingMove) return;
    const promoType = id === 'promo-q' ? PieceType.QUEEN :
                      id === 'promo-r' ? PieceType.ROOK :
                      id === 'promo-b' ? PieceType.BISHOP : PieceType.KNIGHT;

    const finalMove = new ChessMove(
      promotionPendingMove.fromRow,
      promotionPendingMove.fromCol,
      promotionPendingMove.toRow,
      promotionPendingMove.toCol,
      promoType
    );

    promotionPendingMove = null;
    const overlay = document.getElementById('promotion-dialog');
    overlay.classList.remove('active');
    submitTacticalMove(finalMove.toUci());
  });
});

async function submitTacticalMove(uci) {
  selSquare = null;
  legalTargets = [];

  if (isOfflineGame) {
    submitOfflineTacticalMove(uci);
    return;
  }
  
  const inPredictPhase = (activeGame.phase === 'predict');
  const myTurnStr = myColor === PieceColor.WHITE ? 'white' : 'black';
  const oppTurnStr = myColor === PieceColor.WHITE ? 'black' : 'white';

  if (inPredictPhase) {
    try {
      await updateDoc(doc(db, 'games', activeGameId), {
        pendingPrediction: uci,
        phase: 'move',
        currentTurn: oppTurnStr
      });
      showToast('Prediction submitted!', 'success');
    } catch (e) {
      showToast('Failed to lock prediction.', 'error');
    }
  } else {
    const prediction = activeGame.pendingPrediction || "";
    
    if (prediction && uci === prediction) {
      const fromSq = uci.substring(0, 2);
      const fromCol = uci.charCodeAt(0) - 'a'.charCodeAt(0);
      const fromRow = 8 - parseInt(uci[1], 10);
      const piece = activeBoard.squares[fromRow][fromCol];
      const trapEvent = `trap:${fromSq}`;

      if (piece && piece.type === PieceType.KING) {
        const resultStatus = myColor === PieceColor.WHITE ? 'black_wins' : 'white_wins';
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'games', activeGameId), {
            events: arrayUnion(trapEvent),
            predictions: arrayUnion(prediction),
            status: "finished",
            result: resultStatus,
            pendingPrediction: ""
          });
          batch.update(doc(db, 'users', activeGame.whiteUid), { openGames: arrayRemove(activeGameId) });
          batch.update(doc(db, 'users', activeGame.blackUid), { openGames: arrayRemove(activeGameId) });
          await batch.commit();
        } catch (_) {}
      } else {
        try {
          await updateDoc(doc(db, 'games', activeGameId), {
            events: arrayUnion(trapEvent),
            predictions: arrayUnion(prediction),
            phase: 'move',
            currentTurn: myTurnStr,
            pendingPrediction: ""
          });
        } catch (_) {}
      }
    } else {
      try {
        await updateDoc(doc(db, 'games', activeGameId), {
          events: arrayUnion(uci),
          predictions: arrayUnion(prediction),
          phase: 'predict',
          currentTurn: myTurnStr,
          pendingPrediction: ""
        });
      } catch (e) {
        showToast('Failed to post move.', 'error');
      }
    }
  }
}

// OFFLINE GAME LAUNCH TACTICS
function submitOfflineTacticalMove(uci) {
  const sourceGame = offlineGameData;
  const inPredictPhase = (sourceGame.phase === 'predict');

  if (inPredictPhase) {
    sourceGame.pendingPrediction = uci;
    sourceGame.phase = 'move';
    
    if (activeGameId === 'offline_bot') {
      sourceGame.currentTurn = 'black'; // Pass turn to Bot
      saveOfflineGame();
      renderGameRoom();
      triggerBotAction();
    } else {
      // Pass & Play: alternate turn, flip board
      sourceGame.currentTurn = sourceGame.currentTurn === 'white' ? 'black' : 'white';
      myColor = sourceGame.currentTurn === 'white' ? PieceColor.WHITE : PieceColor.BLACK;
      isFlipped = (myColor === PieceColor.BLACK);
      saveOfflineGame();
      renderGameRoom();
      showToast('Prediction locked in! Hand device to Opponent.', 'success');
    }
  } else {
    const prediction = sourceGame.pendingPrediction || "";
    
    if (prediction && uci === prediction) {
      // Trap Triggered!
      const fromSq = uci.substring(0, 2);
      const fromCol = uci.charCodeAt(0) - 'a'.charCodeAt(0);
      const fromRow = 8 - parseInt(uci[1], 10);
      const piece = activeBoard.squares[fromRow][fromCol];
      const trapEvent = `trap:${fromSq}`;

      if (piece && piece.type === PieceType.KING) {
        // King vaporized!
        sourceGame.events.push(trapEvent);
        sourceGame.predictions.push(prediction);
        sourceGame.status = 'completed';
        sourceGame.result = sourceGame.currentTurn === 'white' ? 'white_wins' : 'black_wins';
        sourceGame.pendingPrediction = "";
        saveOfflineGame();
        renderGameRoom();
        showGameOverOffline(sourceGame.result === 'white_wins' ? GameResult.CHECKMATE_WHITE_WINS : GameResult.CHECKMATE_BLACK_WINS);
      } else {
        // Piece vaporized, compensation move follows
        sourceGame.events.push(trapEvent);
        sourceGame.predictions.push(prediction);
        sourceGame.phase = 'move'; // Stays in move phase
        sourceGame.pendingPrediction = ""; // Clears prediction
        // Turn does NOT switch! Active player gets a compensation move.
        saveOfflineGame();
        renderGameRoom();
        showToast('Trap Sprung! Piece vaporized. Make a compensation move!', 'success');
        
        if (activeGameId === 'offline_bot' && sourceGame.currentTurn === 'black') {
          triggerBotAction(); // Bot thinks for compensation move
        }
      }
    } else {
      // Normal move
      sourceGame.events.push(uci);
      sourceGame.predictions.push(prediction);
      sourceGame.phase = 'predict'; // Pass to prediction phase
      sourceGame.pendingPrediction = "";
      saveOfflineGame();
      renderGameRoom();

      if (activeGameId === 'offline_bot' && sourceGame.currentTurn === 'black') {
        triggerBotAction(); // Bot predicts next
      }
    }
  }
}

// OFFLINE BOT BRAIN SIMULATION
function triggerBotAction() {
  if (isBotThinking) return;
  const sourceGame = offlineGameData;
  if (sourceGame.status !== 'active') return;
  if (reviewIndex !== -1) return;
  if (sourceGame.currentTurn !== 'black') return;

  isBotThinking = true;
  renderGameRoom(); // Draw Thinking banner

  setTimeout(() => {
    try {
      const boardCopy = activeBoard.copy();

      if (sourceGame.phase === 'predict') {
        // Bot predicts player's next move (White)
        const botPrediction = BotEngine.getWeightedPrediction(boardCopy, PieceColor.WHITE);
        sourceGame.pendingPrediction = botPrediction;
        sourceGame.phase = 'move';
        sourceGame.currentTurn = 'white'; // Pass turn back to player
        
        isBotThinking = false;
        saveOfflineGame();
        renderGameRoom();
        showToast('Bot has locked in a prediction!', 'info');
      } else if (sourceGame.phase === 'move') {
        // Bot plays its move using minimax
        const botMove = BotEngine.getBestMove(boardCopy, PieceColor.BLACK, 3);
        isBotThinking = false;

        if (botMove) {
          const uci = botMove.toUci();
          const prediction = sourceGame.pendingPrediction || "";

          if (prediction && uci === prediction) {
            // Bot got trapped!
            const fromSq = uci.substring(0, 2);
            const fromCol = uci.charCodeAt(0) - 'a'.charCodeAt(0);
            const fromRow = 8 - parseInt(uci[1], 10);
            const piece = activeBoard.squares[fromRow][fromCol];
            const trapEvent = `trap:${fromSq}`;

            if (piece && piece.type === PieceType.KING) {
              sourceGame.events.push(trapEvent);
              sourceGame.predictions.push(prediction);
              sourceGame.status = 'completed';
              sourceGame.result = 'white_wins';
              sourceGame.pendingPrediction = "";
              saveOfflineGame();
              renderGameRoom();
              showGameOverOffline(GameResult.CHECKMATE_WHITE_WINS);
            } else {
              sourceGame.events.push(trapEvent);
              sourceGame.predictions.push(prediction);
              sourceGame.phase = 'move';
              sourceGame.pendingPrediction = "";
              saveOfflineGame();
              renderGameRoom();
              showToast('Trap Sprung! Bot piece vaporized.', 'success');
              triggerBotAction(); // Bot thinks again for compensation move!
            }
          } else {
            sourceGame.events.push(uci);
            sourceGame.predictions.push(prediction);
            sourceGame.phase = 'predict';
            sourceGame.pendingPrediction = "";
            saveOfflineGame();
            renderGameRoom();
            triggerBotAction(); // Bot predicts immediately
          }
        } else {
          // Bot has no legal moves
          const result = activeBoard.gameResult();
          sourceGame.status = 'completed';
          sourceGame.result = result === GameResult.CHECKMATE_WHITE_WINS ? 'white_wins' : 'draw';
          saveOfflineGame();
          renderGameRoom();
          showGameOverOffline(result);
        }
      }
    } catch (e) {
      console.error(e);
      isBotThinking = false;
      renderGameRoom();
    }
  }, sourceGame.phase === 'predict' ? 600 : 1200);
}

function showGameOverOffline(result) {
  let msg = "The match ended in a draw.";
  if (result === GameResult.CHECKMATE_WHITE_WINS) {
    msg = activeGameId === 'offline_bot' ? "You defeated the bot! Tactical Victory!" : "White Wins!";
  } else if (result === GameResult.CHECKMATE_BLACK_WINS) {
    msg = activeGameId === 'offline_bot' ? "The bot defeated you. Tactical Defeat." : "Black Wins!";
  }

  showDialog('Game Over', msg, [
    { text: 'Back to Dashboard', type: 'confirm', action: () => showScreen('dashboard') }
  ]);
}

// UPDATE TURN STATE HUD AND CONTROLLER BINDINGS MATCHING ANDROID TEXTS/COLORS
function updateGameHUD(gameRes) {
  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const banner = document.getElementById('game-turn-banner');
  const inPredictPhase = (sourceGame.phase === 'predict');
  
  const isMyTurn = isOfflineGame ? 
    (activeGameId === 'offline_bot' ? (sourceGame.currentTurn === 'white') : true) :
    ((sourceGame.currentTurn === 'white' && sourceGame.whiteUid === currentUid) ||
     (sourceGame.currentTurn === 'black' && sourceGame.blackUid === currentUid));

  const btnFirst = document.getElementById('btn-game-first');
  const btnPrev = document.getElementById('btn-game-prev');
  const btnNext = document.getElementById('btn-game-next');
  const btnLast = document.getElementById('btn-game-last');

  const eventsSize = (sourceGame.events || []).length;

  if (reviewIndex !== -1) {
    // Reviewing banner
    banner.style.color = "var(--accent-blue)";
    banner.textContent = `REVIEWING MOVE ${reviewIndex + 1}/${eventsSize}`;

    btnFirst.disabled = (reviewIndex === 0);
    btnPrev.disabled = (reviewIndex === 0);
    btnNext.disabled = false;
    btnLast.disabled = false;
  } else {
    // Live banner
    btnFirst.disabled = (eventsSize === 0);
    btnPrev.disabled = (eventsSize === 0);
    btnNext.disabled = true;
    btnLast.disabled = true;

    if (gameRes !== GameResult.ONGOING) {
      banner.style.color = "var(--text-secondary)";
      const winner = gameRes === GameResult.CHECKMATE_WHITE_WINS ? 'White wins!' : 
                     gameRes === GameResult.CHECKMATE_BLACK_WINS ? 'Black wins!' : 'Draw.';
      banner.textContent = `GAME CONCLUDED: ${winner.toUpperCase()}`;
      return;
    }

    if (isBotThinking) {
      banner.style.color = "#FFB347"; // Orange thinking banner
      banner.textContent = sourceGame.phase === 'predict' ? "BOT IS PREDICTING..." : "BOT IS THINKING...";
      return;
    }

    if (isMyTurn) {
      if (inPredictPhase) {
        banner.style.color = "var(--accent-blue)";
        banner.textContent = activeGameId === 'local_pass_play' ?
          `PREDICT ${sourceGame.currentTurn.toUpperCase()}'S TARGET MOVE` :
          "PREDICT THEIR MOVE (Click & Drag Opponent Piece)";
      } else {
        banner.style.color = "var(--accent-green)";
        banner.textContent = activeGameId === 'local_pass_play' ?
          `YOUR TURN (${sourceGame.currentTurn.toUpperCase()})` :
          "YOUR TURN";
      }
    } else {
      banner.style.color = "var(--text-secondary)";
      if (inPredictPhase) {
        banner.textContent = "OPPONENT PREDICTING";
      } else {
        banner.textContent = "WAITING FOR OPPONENT";
      }
    }
  }
}

// POPULATE LOG LIST OF ACTIONABLE EVENTS
function populateMoveLog() {
  const container = document.getElementById('game-move-log');
  container.innerHTML = '';

  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const events = sourceGame.events || [];
  const predictions = sourceGame.predictions || [];
  const tempBoard = new ChessBoard();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const movingColor = tempBoard.currentTurn;
    const movingPlayerStr = movingColor === PieceColor.WHITE ? 'White' : 'Black';

    const pred = predictions[i] || "";
    let wasPredicted = false;
    let formattedText = "";

    if (event.startsWith('trap:')) {
      const sq = event.substring(5);
      formattedText = `Piece Destroyed at ${sq}`;
      wasPredicted = true;
      tempBoard.applyTrap(sq);
    } else {
      wasPredicted = (pred && event.startsWith(pred));
      formattedText = formatUciMove(event);
      tempBoard.applyMove(event);
    }

    const row = document.createElement('div');
    row.className = `log-row ${wasPredicted ? 'predicted' : ''} ${reviewIndex === i ? 'review-active' : ''}`;

    const infoPart = document.createElement('div');
    infoPart.className = 'move-log-move-info';
    infoPart.innerHTML = `
      <span class="move-log-number">${Math.floor(i / 2) + 1}.</span>
      <span class="move-log-player">${movingPlayerStr}</span>
      <span class="move-log-notation">${formattedText}</span>
    `;
    row.appendChild(infoPart);

    const predictorLabel = movingPlayerStr === 'White' ? 'Black' : 'White';
    const predLine = document.createElement('div');
    
    if (pred) {
      predLine.className = `move-log-prediction ${wasPredicted ? 'hit' : 'miss'}`;
      predLine.innerHTML = wasPredicted 
        ? `⚡ ${predictorLabel} predicted this move (Trap Sprung!)` 
        : `✛ ${predictorLabel} predicted ${formatUciMove(pred)}`;
    } else {
      predLine.className = 'move-log-prediction none';
      predLine.innerHTML = `✛ ${predictorLabel} did not predict a move`;
    }
    row.appendChild(predLine);

    row.addEventListener('click', () => {
      reviewIndex = i;
      renderGameRoom();
    });

    container.appendChild(row);
  }

  const isMyTurn = isOfflineGame ? 
    (activeGameId === 'offline_bot' ? (sourceGame.currentTurn === 'white') : true) :
    ((sourceGame.currentTurn === 'white' && sourceGame.whiteUid === currentUid) ||
     (sourceGame.currentTurn === 'black' && sourceGame.blackUid === currentUid));

  if (!isMyTurn && sourceGame.phase === 'move' && sourceGame.pendingPrediction) {
    const activeBanner = document.createElement('div');
    activeBanner.className = 'move-log-active-prediction';
    activeBanner.textContent = `Active Prediction: You predicted ${formatUciMove(sourceGame.pendingPrediction)}`;
    container.appendChild(activeBanner);
  }

  if (reviewIndex === -1) {
    container.scrollTop = container.scrollHeight;
  }
}

function formatUciMove(move) {
  if (move.startsWith('trap:')) {
    return `Destroyed at ${move.substring(5)}`;
  }
  if (move.length >= 4) {
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    const promo = move.length >= 5 ? `=${move[4].toUpperCase()}` : "";
    return `${from} → ${to}${promo}`;
  }
  return move;
}

// HISTORICAL REVIEW LOGIC BINDINGS
document.getElementById('btn-game-first').addEventListener('click', () => {
  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const events = sourceGame.events || [];
  if (events.length > 0) {
    reviewIndex = 0;
    renderGameRoom();
  }
});

document.getElementById('btn-game-prev').addEventListener('click', () => {
  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const events = sourceGame.events || [];
  if (events.length > 0) {
    if (reviewIndex === -1) {
      reviewIndex = events.length - 1;
    } else {
      reviewIndex = Math.max(0, reviewIndex - 1);
    }
    renderGameRoom();
  }
});

document.getElementById('btn-game-next').addEventListener('click', () => {
  const sourceGame = isOfflineGame ? offlineGameData : activeGame;
  const events = sourceGame.events || [];
  if (events.length > 0 && reviewIndex !== -1) {
    if (reviewIndex === events.length - 1) {
      reviewIndex = -1;
    } else {
      reviewIndex++;
    }
    renderGameRoom();
  }
});

document.getElementById('btn-game-last').addEventListener('click', () => {
  reviewIndex = -1;
  renderGameRoom();
});

// Resign Button
document.getElementById('btn-game-resign').addEventListener('click', () => {
  showDialog('Resign Game', 'Are you sure you want to resign this room?', [
    {
      text: 'Resign',
      type: 'danger',
      action: async () => {
        if (isOfflineGame) {
          offlineGameData.status = 'completed';
          offlineGameData.result = (activeGameId === 'offline_bot' || offlineGameData.currentTurn === 'white') ? 'black_wins' : 'white_wins';
          saveOfflineGame();
          renderGameRoom();
          showGameOverOffline(offlineGameData.result === 'white_wins' ? GameResult.CHECKMATE_WHITE_WINS : GameResult.CHECKMATE_BLACK_WINS);
        } else {
          const resignResult = myColor === PieceColor.WHITE ? 'black_wins' : 'white_wins';
          await finalizeGameOnDBDirectly(resignResult);
          showToast('You resigned.', 'info');
          showScreen('dashboard');
        }
      }
    },
    { text: 'Cancel', type: 'cancel' }
  ]);
});

// Exit / Back
document.getElementById('btn-game-exit').addEventListener('click', () => {
  showScreen('dashboard');
});

// AUTO FINALIZE GAME IN DATABASE
async function finalizeGameOnDB(result) {
  const statusStr = (result === GameResult.CHECKMATE_WHITE_WINS) ? 'white_wins' :
                    (result === GameResult.CHECKMATE_BLACK_WINS) ? 'black_wins' : 'draw';
  await finalizeGameOnDBDirectly(statusStr);
  
  const userWon = (result === GameResult.CHECKMATE_WHITE_WINS && myColor === PieceColor.WHITE) ||
                  (result === GameResult.CHECKMATE_BLACK_WINS && myColor === PieceColor.BLACK);
  const userLost = (result === GameResult.CHECKMATE_WHITE_WINS && myColor === PieceColor.BLACK) ||
                   (result === GameResult.CHECKMATE_BLACK_WINS && myColor === PieceColor.WHITE);
  
  let msg = "The room ended in a draw.";
  if (userWon) msg = "You win!";
  if (userLost) msg = "You lose.";

  showDialog('Game Over', msg, [
    { text: 'OK', type: 'confirm', action: () => showScreen('dashboard') }
  ]);
}

async function finalizeGameOnDBDirectly(resultStr) {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'games', activeGameId), {
      status: "finished",
      result: resultStr
    });
    batch.update(doc(db, 'users', activeGame.whiteUid), { openGames: arrayRemove(activeGameId) });
    batch.update(doc(db, 'users', activeGame.blackUid), { openGames: arrayRemove(activeGameId) });
    await batch.commit();
  } catch (_) {}
}

// --- FLAT VECTOR CHESS SVG GRAPHICS DECK ---
function getPieceSvg(type, color) {
  const isWhite = color === PieceColor.WHITE;
  const strokeColor = isWhite ? "#596A82" : "#3A86FF";
  const fillGradientId = `grad-${type}-${color}`;
  
  const gradient = isWhite 
    ? `<linearGradient id="${fillGradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
         <stop offset="0%" stop-color="#ffffff" />
         <stop offset="100%" stop-color="#e2e6ed" />
       </linearGradient>`
    : `<linearGradient id="${fillGradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
         <stop offset="0%" stop-color="#2a364f" />
         <stop offset="100%" stop-color="#121a26" />
       </linearGradient>`;

  const baseSvg = (content) => `
    <svg viewBox="0 0 45 45" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>${gradient}</defs>
      <g fill="url(#${fillGradientId})" stroke="${strokeColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
        ${content}
      </g>
    </svg>
  `;

  switch (type) {
    case PieceType.KING:
      return baseSvg(`
        <path d="M22.5 11.63V6M20 8h5M11.5 37c0 1 1.5 2 11 2s11-1 11-2M11.5 30c0-2.5 2-5 3.5-7.5C18.5 22 21.5 19 22.5 15c1 4 4 7 7.5 7.5 1.5 2.5 3.5 5 3.5 7.5H11.5z" />
        <path d="M11.5 30c0 1.5 2 3 11 3s11-1.5 11-3H11.5z" />
        <path d="M12.5 33.5c0 1.5 1.5 2.5 10 2.5s10-1 10-2.5h-20z" />
      `);
    case PieceType.QUEEN:
      return baseSvg(`
        <path d="M9 26c0-4 2.5-9 6-12.5L22.5 30 30 13.5c3.5 3.5 6 8.5 6 12.5H9z" />
        <path d="M9 26c0 2 2.5 4 13.5 4s13.5-2 13.5-4H9z" />
        <path d="M11.5 30c0 1.5 2 3 11 3s11-1.5 11-3H11.5z" />
        <path d="M12.5 33.5c0 1.5 1.5 2.5 10 2.5s10-1 10-2.5h-20z" />
        <path d="M11.5 37c0 1 1.5 2 11 2s11-1 11-2" />
        <circle cx="9" cy="26" r="1.5" />
        <circle cx="15" cy="13.5" r="1.5" />
        <circle cx="22.5" cy="9" r="1.5" />
        <circle cx="30" cy="13.5" r="1.5" />
        <circle cx="36" cy="26" r="1.5" />
      `);
    case PieceType.ROOK:
      return baseSvg(`
        <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM12 32l1-17h19l1 17H12zM14 15v-4h4v2h5v-2h5v2h5v-4h4v4H14z" />
        <path d="M11 36c0 1 2 2 11.5 2s11.5-1 11.5-2H11z" />
      `);
    case PieceType.BISHOP:
      return baseSvg(`
        <path d="M9 36c3.39 0 7.66-.69 11.5-2.33 3.84 1.64 8.11 2.33 11.5 2.33M15 30c0-4.5 4-8.5 7.5-16.5 3.5 8 7.5 12 7.5 16.5H15z" />
        <path d="M17.5 18c2 1 3 3 5 4M11.5 37c0 1 1.5 2 11 2s11-1 11-2" />
        <circle cx="22.5" cy="10" r="1.5" />
        <path d="M11.5 30c0 1.5 2 3 11 3s11-1.5 11-3H11.5z" />
        <path d="M12.5 33.5c0 1.5 1.5 2.5 10 2.5s10-1 10-2.5h-20z" />
      `);
    case PieceType.KNIGHT:
      return baseSvg(`
        <path d="M22 10c-3 0-6 2-7.5 5-1.5 3-1.5 7 1 9.5 2.5 2.5 2.5 4.5.5 7.5-2 3-2 5 2 5h17s2-5.5-2-9c-4-3.5-3-6-3-9s-2-6-8-9z" />
        <path d="M9 39c0 1 1.5 2 11 2s11-1 11-2" />
        <circle cx="17.5" cy="15" r="1" />
        <path d="M20 23.5c2-1 4-1 6-1" />
      `);
    case PieceType.PAWN:
      return baseSvg(`
        <circle cx="22.5" cy="14.5" r="6.5" />
        <path d="M15 36c0-5 3.5-8 7.5-12.5 4 4.5 7.5 7.5 7.5 12.5H15z" />
        <path d="M11.5 37c0 1 1.5 2 11 2s11-1 11-2" />
        <path d="M15 36c0 1 2 2 7.5 2s7.5-1 7.5-2H15z" />
      `);
    default:
      return "";
  }
}
