import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getDatabase, ref, set, get, child, update } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

// Firebase Config Credentials
const firebaseConfig = {
  apiKey: "AIzaSyDLyKnCJbv_DGzdpAVjtft_A-gfdP4-D2M",
  authDomain: "free-reward-f7644.firebaseapp.com",
  databaseURL: "https://free-reward-f7644-default-rtdb.firebaseio.com",
  projectId: "free-reward-f7644",
  storageBucket: "free-reward-f7644.firebasestorage.app",
  messagingSenderId: "765331223999",
  appId: "1:765331223999:web:0ca123055c90376fd31d0a",
  measurementId: "G-N96G5QFZRX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let gameState = {
    nickname: "",
    myReferralCode: "",
    referredBy: "",
    coins: 0,
    lifetimeCoins: 0,
    lifetimeTaps: 0,
    level: 1,
    xp: 0,
    energy: 1000,
    currentTier: 0,
    claimedTasks: [],
    lastDailyClaim: 0,
    ytSubsStarted: false,
    ytSubsClaimed: false,
    ytLikeStarted: false,
    ytLikeClaimed: false,
    // New Tasks States
    ytSubsStarted2: false,
    ytSubsClaimed2: false,
    ytLikeStarted2: false,
    ytLikeClaimed2: false,
    avatar: "🚀", // Default Preset Avatar Emoji
    soundEnabled: true
};

const powerTiers = {
    0: { name: "Starter Kit", clickPower: 1, maxEnergy: 1000, rechargeRate: 2, passiveBot: 0 },
    1: { name: "Normal Power", price: 1000, clickPower: 2, maxEnergy: 1500, rechargeRate: 4, passiveBot: 0 },
    2: { name: "Rare Power", price: 15000, clickPower: 3.5, maxEnergy: 2000, rechargeRate: 7, passiveBot: 0 },
    3: { name: "Epic Power", price: 80000, clickPower: 5, maxEnergy: 3000, rechargeRate: 12, passiveBot: 0 },
    4: { name: "Master Power", price: 300000, clickPower: 10, maxEnergy: 5000, rechargeRate: 20, passiveBot: 2 },
    5: { name: "Mythic Power", price: 500000, clickPower: 15, maxEnergy: 10000, rechargeRate: 225, passiveBot: 4 }
};

const getXPRequired = (lvl) => lvl * 100;

function generateUniqueCode(name) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `KOMBAT-${name.substring(0,3).toUpperCase()}${randomNum}`;
}

function playSynthSound(freq, type, duration) {
    if (!gameState.soundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = type;
        oscillator.frequency.value = freq;
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) { console.log("Audio contexts locked"); }
}

const sounds = {
    tap: () => playSynthSound(440, 'sine', 0.08),
    upgrade: () => playSynthSound(587.33, 'triangle', 0.2),
    claim: () => playSynthSound(880, 'triangle', 0.3),
    levelUp: () => { playSynthSound(523.25, 'sine', 0.1); setTimeout(() => playSynthSound(659.25, 'sine', 0.1), 100); }
};

document.addEventListener("DOMContentLoaded", () => {
    loadLocalFallback();
    initUI();
    
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.style.opacity = 0;
            setTimeout(() => {
                splash.remove();
                checkRegistrationRequirement();
            }, 500);
        }
    }, 3500);

    setInterval(() => {
        const activeConfig = powerTiers[gameState.currentTier];
        if (gameState.energy < activeConfig.maxEnergy) {
            gameState.energy = Math.min(activeConfig.maxEnergy, gameState.energy + activeConfig.rechargeRate);
        }
        if (activeConfig.passiveBot > 0) {
            gameState.coins += activeConfig.passiveBot;
            gameState.lifetimeCoins += activeConfig.passiveBot;
        }
        updateUI();
        saveGameData(); 
    }, 1000);
});

function checkRegistrationRequirement() {
    if (!gameState.nickname || gameState.nickname.trim() === "") {
        document.getElementById('register-overlay').classList.remove('hidden');
    } else {
        fetchCloudData(gameState.nickname);
    }
}

function initUI() {
    const tapBtn = document.getElementById('tap-button');
    if (tapBtn) { tapBtn.addEventListener('click', (e) => handleTap(e)); }

    document.getElementById('submit-nickname-btn').addEventListener('click', () => {
        const inputVal = document.getElementById('nickname-input').value;
        if(inputVal && inputVal.trim() !== "") {
            const cleanName = inputVal.trim().replace(/[^a-zA-Z0-9]/g, "_"); 
            gameState.nickname = cleanName;
            gameState.myReferralCode = generateUniqueCode(cleanName);
            fetchCloudData(cleanName); 
            document.getElementById('register-overlay').classList.add('hidden');
            sounds.claim();
        } else {
            alert("Please input a valid username!");
        }
    });

    document.getElementById('sound-toggle').addEventListener('change', (e) => {
        gameState.soundEnabled = e.target.checked;
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        if(confirm("Wipe all locally synced game state maps?")) {
            localStorage.clear();
            location.reload();
        }
    });

    document.getElementById('stats-trigger').addEventListener('click', () => {
        document.getElementById('stats-box').classList.toggle('hidden');
    });

    document.getElementById('daily-reward-btn').addEventListener('click', claimDailyReward);

    // Profile Image File Upload Parser Logic
    const fileInput = document.getElementById('avatar-file-input');
    if(fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 500000) { // Limit size to 500KB for Realtime database storage
                alert("File too large! Choose an image under 500KB.");
                return;
            }
            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 100;
                    const MAX_HEIGHT = 100;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Compress to Base64 JPEG data block
                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
                    gameState.avatar = compressedBase64;
                    document.getElementById('upload-status-text').textContent = "Custom Pic Active";
                    sounds.claim();
                    updateUI();
                    saveGameData();
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    updateUI();
}

function handleTap(e) {
    const activeConfig = powerTiers[gameState.currentTier];
    if (gameState.energy < activeConfig.clickPower) return;

    gameState.energy -= Math.floor(activeConfig.clickPower);
    gameState.coins += activeConfig.clickPower;
    gameState.lifetimeCoins += activeConfig.clickPower;
    gameState.lifetimeTaps += 1;
    gameState.xp += activeConfig.clickPower;

    sounds.tap();
    createCircularRipple(e);
    createFloatingText(e, `+${activeConfig.clickPower}`);
    checkLevelUp();
    updateUI();
}

function createCircularRipple(e) {
    const btn = document.getElementById('tap-button');
    const ripple = document.createElement('span');
    ripple.className = 'click-ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size/2}px`;
    ripple.style.top = `${e.clientY - rect.top - size/2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
}

function createFloatingText(e, text) {
    const tapArea = document.querySelector('.tap-area');
    const tip = document.createElement('div');
    tip.className = 'floating-text';
    tip.textContent = text;
    const rect = e.target.getBoundingClientRect();
    tip.style.left = `${e.clientX - rect.left}px`;
    tip.style.top = `${e.clientY - rect.top}px`;
    tapArea.appendChild(tip);
    setTimeout(() => tip.remove(), 700);
}

function checkLevelUp() {
    let reqXp = getXPRequired(gameState.level);
    if (gameState.xp >= reqXp) {
        gameState.xp -= reqXp;
        gameState.level += 1;
        sounds.levelUp();
        updateUI();
    }
}

window.buyTierUpgrade = function(tierIndex) {
    if(gameState.currentTier >= tierIndex) return alert("Tier already owned!");
    if(tierIndex > gameState.currentTier + 1) return alert("Unlock previous tiers first!");

    const config = powerTiers[tierIndex];
    if (gameState.coins >= config.price) {
        gameState.coins -= config.price;
        gameState.currentTier = tierIndex;
        gameState.energy = config.maxEnergy;
        sounds.upgrade();
        updateUI();
    } else { alert("Insufficient points!"); }
};

// Preset Avatar Selection Handler
window.selectPresetAvatar = function(emoji) {
    gameState.avatar = emoji;
    document.querySelectorAll('.preset-avatar').forEach(item => {
        if(item.textContent === emoji) item.classList.add('active');
        else item.classList.remove('active');
    });
    document.getElementById('upload-status-text').textContent = "Preset Saved";
    sounds.claim();
    updateUI();
    saveGameData();
};

// ================= VERIFICATION TASKS DELAYS WITH COUNTDOWNS =================

// OLD YouTube Subscribe Task Countdown Handler (5,000 points)
window.clickYTSubs = function() {
    if (gameState.ytSubsClaimed) return;
    gameState.ytSubsStarted = true;
    saveGameData();
    
    let timerVal = 3;
    const btn = document.getElementById('claim-yt-subs-btn');
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.innerHTML = `Wait ${timerVal}s`;
        const clock = setInterval(() => {
            timerVal--;
            if (timerVal <= 0) {
                clearInterval(clock);
                btn.removeAttribute('disabled');
                btn.innerHTML = "Claim";
            } else {
                btn.innerHTML = `Wait ${timerVal}s`;
            }
        }, 1000);
    }
};

window.claimYTSubs = function() {
    if(gameState.ytSubsClaimed) return;
    gameState.coins += 5000;
    gameState.lifetimeCoins += 5000;
    gameState.ytSubsClaimed = true;
    sounds.claim();
    updateUI();
    saveGameData();
};

// NEW YouTube Subscribe Task Countdown Handler (5,000 points)
window.clickYTSubs2 = function() {
    if (gameState.ytSubsClaimed2) return;
    gameState.ytSubsStarted2 = true;
    saveGameData();
    
    let timerVal = 3;
    const btn = document.getElementById('claim-yt-subs-2-btn');
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.innerHTML = `Wait ${timerVal}s`;
        const clock = setInterval(() => {
            timerVal--;
            if (timerVal <= 0) {
                clearInterval(clock);
                btn.removeAttribute('disabled');
                btn.innerHTML = "Claim";
            } else {
                btn.innerHTML = `Wait ${timerVal}s`;
            }
        }, 1000);
    }
};

window.claimYTSubs2 = function() {
    if(gameState.ytSubsClaimed2) return;
    gameState.coins += 5000;
    gameState.lifetimeCoins += 5000;
    gameState.ytSubsClaimed2 = true;
    sounds.claim();
    updateUI();
    saveGameData();
};

// OLD YouTube Like & View Countdown Handler (500 points)
window.clickYTLike = function() {
    if (gameState.ytLikeClaimed) return;
    gameState.ytLikeStarted = true;
    saveGameData();
    
    let timerVal = 3;
    const btn = document.getElementById('claim-yt-like-btn');
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.innerHTML = `Wait ${timerVal}s`;
        const clock = setInterval(() => {
            timerVal--;
            if (timerVal <= 0) {
                clearInterval(clock);
                btn.removeAttribute('disabled');
                btn.innerHTML = "Claim";
            } else {
                btn.innerHTML = `Wait ${timerVal}s`;
            }
        }, 1000);
    }
};

window.claimYTLike = function() {
    if(gameState.ytLikeClaimed) return;
    gameState.coins += 500;
    gameState.lifetimeCoins += 500;
    gameState.ytLikeClaimed = true;
    sounds.claim();
    updateUI();
    saveGameData();
};

// NEW YouTube Like & View Countdown Handler (1,500 points)
window.clickYTLike2 = function() {
    if (gameState.ytLikeClaimed2) return;
    gameState.ytLikeStarted2 = true;
    saveGameData();
    
    let timerVal = 3;
    const btn = document.getElementById('claim-yt-like-2-btn');
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.innerHTML = `Wait ${timerVal}s`;
        const clock = setInterval(() => {
            timerVal--;
            if (timerVal <= 0) {
                clearInterval(clock);
                btn.removeAttribute('disabled');
                btn.innerHTML = "Claim";
            } else {
                btn.innerHTML = `Wait ${timerVal}s`;
            }
        }, 1000);
    }
};

window.claimYTLike2 = function() {
    if(gameState.ytLikeClaimed2) return;
    gameState.coins += 1500;
    gameState.lifetimeCoins += 1500;
    gameState.ytLikeClaimed2 = true;
    sounds.claim();
    updateUI();
    saveGameData();
};

window.claimTask = function(taskId, reward) {
    if (gameState.claimedTasks.includes(taskId)) return;
    if (taskId === 'task500' && gameState.lifetimeTaps < 500) return alert("Tap 500 times first!");

    gameState.coins += reward;
    gameState.claimedTasks.push(taskId);
    sounds.claim();
    updateUI();
    saveGameData();
};

function claimDailyReward() {
    const now = Date.now();
    if (now - gameState.lastDailyClaim > 86400000) {
        gameState.coins += 1000;
        gameState.lastDailyClaim = now;
        sounds.claim();
        alert("Daily Reward Claimed!");
        updateUI();
        saveGameData();
    } else { alert("Come back tomorrow!"); }
}

window.submitFriendCode = function() {
    const inputCode = document.getElementById('friend-code-input').value.trim().toUpperCase();
    if (!inputCode) return alert("Please enter a code!");
    if (inputCode === gameState.myReferralCode) return alert("You cannot use your own code!");
    if (gameState.referredBy) return alert("You have already claimed a code!");

    const dbRef = ref(getDatabase());
    get(child(dbRef, 'players')).then((snapshot) => {
        if (snapshot.exists()) {
            const players = snapshot.val();
            let foundOwner = null;

            for (let player in players) {
                if (players[player].myReferralCode === inputCode) {
                    foundOwner = player;
                    break;
                }
            }

            if (foundOwner) {
                const currentOwnerCoins = players[foundOwner].coins || 0;
                const newOwnerCoins = currentOwnerCoins + 500;
                
                update(ref(db, 'players/' + foundOwner), { coins: newOwnerCoins });

                gameState.referredBy = inputCode;
                gameState.coins += 500; 
                sounds.claim();
                alert(`Success! Referral complete.`);
                document.getElementById('friend-code-input').disabled = true;
                updateUI();
                saveGameData();
            } else {
                alert("Invalid verification block config code!");
            }
        }
    });
};

// Switch Pages including Leaderboard trigger
window.switchPage = function(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById(pageId).classList.remove('hidden');
    
    if(pageId === 'home-page') document.querySelector(".nav-item:nth-child(1)").classList.add('active');
    if(pageId === 'upgrades-page') document.querySelector(".nav-item:nth-child(2)").classList.add('active');
    if(pageId === 'tasks-page') document.querySelector(".nav-item:nth-child(3)").classList.add('active');
    if(pageId === 'leaderboard-page') {
        document.querySelector(".nav-item:nth-child(4)").classList.add('active');
        fetchGlobalLeaderboard();
    }
    if(pageId === 'wallet-page') document.querySelector(".nav-item:nth-child(5)").classList.add('active');
    sounds.tap();
};

// Retrieve Global Rankings from Firebase Realtime Database
function fetchGlobalLeaderboard() {
    const listDiv = document.getElementById('leaderboard-list');
    if (!listDiv) return;
    
    listDiv.innerHTML = `<div style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Fetching records...</div>`;
    
    const dbRef = ref(getDatabase());
    get(child(dbRef, 'players')).then((snapshot) => {
        if (snapshot.exists()) {
            const players = snapshot.val();
            let playersArray = [];
            
            for (let username in players) {
                playersArray.push({
                    username: username,
                    coins: players[username].coins || 0,
                    level: players[username].level || 1,
                    avatar: players[username].avatar || "🚀"
                });
            }
            
            // Sort Descending order based on point values
            playersArray.sort((a, b) => b.coins - a.coins);
            
            listDiv.innerHTML = "";
            playersArray.forEach((player, idx) => {
                const rank = idx + 1;
                const isTopThree = rank <= 3;
                const itemClass = isTopThree ? "leaderboard-item top-three" : "leaderboard-item";
                const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
                
                let avatarLayout = "";
                if (player.avatar.startsWith("data:image")) {
                    avatarLayout = `<img src="${player.avatar}" class="leaderboard-avatar-img">`;
                } else {
                    avatarLayout = `<div class="leaderboard-avatar-img">${player.avatar}</div>`;
                }
                
                const cardHtml = `
                    <div class="${itemClass}">
                        <div class="leaderboard-item-left">
                            <span class="leaderboard-rank">${medal}</span>
                            ${avatarLayout}
                            <span class="leaderboard-username">${player.username}</span>
                        </div>
                        <div class="leaderboard-item-right">
                            <span class="leaderboard-points">${Math.floor(player.coins).toLocaleString()} Pts</span>
                            <div class="leaderboard-lvl">Lvl ${player.level}</div>
                        </div>
                    </div>
                `;
                listDiv.insertAdjacentHTML('beforeend', cardHtml);
            });
        } else {
            listDiv.innerHTML = `<div style="text-align:center; color: #888; padding: 20px;">No miners registered yet!</div>`;
        }
    }).catch((err) => {
        listDiv.innerHTML = `<div style="text-align:center; color: #ff4a4a; padding: 20px;">Failed to synchronize leaderboard database</div>`;
        console.error(err);
    });
}

function updateUI() {
    const activeConfig = powerTiers[gameState.currentTier];
    const reqXp = getXPRequired(gameState.level);

    const cb = document.getElementById('coin-balance');
    const wcd = document.getElementById('wallet-coin-display');
    const ld = document.getElementById('level-display');
    const ec = document.getElementById('energy-current');
    const em = document.getElementById('energy-max');
    const tpv = document.getElementById('tap-power-val');
    const xpd = document.getElementById('xp-display');
    const un = document.getElementById('display-username');
    const refDisplay = document.getElementById('my-referral-code');
    const nld = document.getElementById('next-level-display');

    if(cb) cb.textContent = Math.floor(gameState.coins).toLocaleString();
    if(wcd) wcd.textContent = Math.floor(gameState.coins).toLocaleString();
    if(ld) ld.textContent = `Level ${gameState.level}`;
    
    // Dynamic Next Level Counter calculation
    if(nld) nld.textContent = `LVL ${gameState.level + 1}`;

    if(ec) ec.textContent = Math.floor(gameState.energy);
    if(em) em.textContent = activeConfig.maxEnergy;
    if(tpv) tpv.textContent = activeConfig.clickPower;
    if(xpd) xpd.textContent = `XP: ${Math.floor(gameState.xp)} / ${reqXp}`;
    if(un && gameState.nickname) un.textContent = gameState.nickname;
    if(refDisplay && gameState.myReferralCode) refDisplay.textContent = gameState.myReferralCode;

    // Header Avatar sync render
    const headerAvatar = document.getElementById('avatar-container');
    if (headerAvatar && gameState.avatar) {
        if (gameState.avatar.startsWith("data:image")) {
            headerAvatar.innerHTML = `<img src="${gameState.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            headerAvatar.innerHTML = gameState.avatar;
        }
    }

    if(gameState.referredBy) {
        const friendIn = document.getElementById('friend-code-input');
        const friendBtn = document.getElementById('submit-friend-code-btn');
        if(friendIn) friendIn.disabled = true;
        if(friendBtn) friendBtn.textContent = "Redeemed";
    }

    const eb = document.getElementById('energy-bar');
    const xb = document.getElementById('xp-bar');
    if(eb) eb.style.width = `${(gameState.energy / activeConfig.maxEnergy) * 100}%`;
    if(xb) xb.style.width = `${(gameState.xp / reqXp) * 100}%`;

    // OLD Task 1 Visibility Setup
    const btnSubs = document.getElementById('claim-yt-subs-btn');
    if(gameState.ytSubsStarted && !gameState.ytSubsClaimed && btnSubs) {
        if (!btnSubs.innerHTML.includes("Wait")) {
            btnSubs.removeAttribute('disabled');
        }
    }
    if(gameState.ytSubsClaimed) {
        const box = document.getElementById('task-yt-subs');
        if(box) box.style.display = 'none';
    }

    // NEW Task 1 Visibility Setup
    const btnSubs2 = document.getElementById('claim-yt-subs-2-btn');
    if(gameState.ytSubsStarted2 && !gameState.ytSubsClaimed2 && btnSubs2) {
        if (!btnSubs2.innerHTML.includes("Wait")) {
            btnSubs2.removeAttribute('disabled');
        }
    }
    if(gameState.ytSubsClaimed2) {
        const box = document.getElementById('task-yt-subs-2');
        if(box) box.style.display = 'none';
    }

    // OLD Task 2 Visibility Setup
    const btnLike = document.getElementById('claim-yt-like-btn');
    if(gameState.ytLikeStarted && !gameState.ytLikeClaimed && btnLike) {
        if (!btnLike.innerHTML.includes("Wait")) {
            btnLike.removeAttribute('disabled');
        }
    }
    if(gameState.ytLikeClaimed) {
        const box = document.getElementById('task-yt-like');
        if(box) box.style.display = 'none';
    }

    // NEW Task 2 Visibility Setup
    const btnLike2 = document.getElementById('claim-yt-like-2-btn');
    if(gameState.ytLikeStarted2 && !gameState.ytLikeClaimed2 && btnLike2) {
        if (!btnLike2.innerHTML.includes("Wait")) {
            btnLike2.removeAttribute('disabled');
        }
    }
    if(gameState.ytLikeClaimed2) {
        const box = document.getElementById('task-yt-like-2');
        if(box) box.style.display = 'none';
    }

    gameState.claimedTasks.forEach(taskId => {
        if(taskId === 'task500') {
            const btn500 = document.querySelector('#task-500 .claim-btn');
            if(btn500) btn500.disabled = true;
        }
    });

    const slc = document.getElementById('stat-life-coins');
    const slt = document.getElementById('stat-life-taps');
    if(slc) slc.textContent = Math.floor(gameState.lifetimeCoins).toLocaleString();
    if(slt) slt.textContent = gameState.lifetimeTaps.toLocaleString();
}

function fetchCloudData(username) {
    const dbRef = ref(getDatabase());
    get(child(dbRef, `players/${username}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const cloudData = snapshot.val();
            gameState = Object.assign({}, gameState, cloudData);
            
            // Backup validation if fetching older database parameters
            if (!gameState.avatar) gameState.avatar = "🚀";
            if (gameState.ytSubsStarted2 === undefined) gameState.ytSubsStarted2 = false;
            if (gameState.ytSubsClaimed2 === undefined) gameState.ytSubsClaimed2 = false;
            if (gameState.ytLikeStarted2 === undefined) gameState.ytLikeStarted2 = false;
            if (gameState.ytLikeClaimed2 === undefined) gameState.ytLikeClaimed2 = false;
            
            updateUI();
        } else {
            saveGameData();
        }
    }).catch((error) => { console.error(error); });
}

function saveGameData() {
    if (!gameState.nickname) return;
    set(ref(db, 'players/' + gameState.nickname), {
        myReferralCode: gameState.myReferralCode,
        referredBy: gameState.referredBy,
        coins: gameState.coins,
        lifetimeCoins: gameState.lifetimeCoins,
        lifetimeTaps: gameState.lifetimeTaps,
        level: gameState.level,
        xp: gameState.xp,
        energy: gameState.energy,
        currentTier: gameState.currentTier,
        claimedTasks: gameState.claimedTasks,
        lastDailyClaim: gameState.lastDailyClaim,
        ytSubsStarted: gameState.ytSubsStarted,
        ytSubsClaimed: gameState.ytSubsClaimed,
        ytLikeStarted: gameState.ytLikeStarted,
        ytLikeClaimed: gameState.ytLikeClaimed,
        // Sync New State variables to Cloud DB
        ytSubsStarted2: gameState.ytSubsStarted2,
        ytSubsClaimed2: gameState.ytSubsClaimed2,
        ytLikeStarted2: gameState.ytLikeStarted2,
        ytLikeClaimed2: gameState.ytLikeClaimed2,
        avatar: gameState.avatar
    });
    localStorage.setItem("kombat_save_state", JSON.stringify(gameState));
}

function loadLocalFallback() {
    let saved = localStorage.getItem("kombat_save_state");
    if (saved) {
        try {
            let parsed = JSON.parse(saved);
            gameState = Object.assign({}, gameState, parsed);
        } catch(e) { console.error(e); }
    }
}