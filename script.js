// Basic 3D first-person game using Three.js
// Save as script.js and keep three.min.js included in index.html

// ---- Settings ----
const WORLD_HALF_SIZE = 50; // bounds +/- on x and z
const NUM_BLOCKS = 1000;
const BLOCK_SIZE = 2;
const PLAYER_HEIGHT = 2.0;
const PLAYER_RADIUS = 0.6;
const GRAVITY = -30;
const JUMP_V = 12;
const MOVE_SPEED = 8;
const SPRINT_MULT = 1.9;

// ---- Three.js setup ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88caff);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, PLAYER_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
hemi.position.set(0, 200, 0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(-1, 2, 1);
scene.add(dir);

// floor
const floorGeo = new THREE.BoxGeometry(WORLD_HALF_SIZE*2, 1, WORLD_HALF_SIZE*2);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x334422 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.position.y = -0.5;
scene.add(floor);

// surrounding walls (a closed box)
const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
const wallThickness = 2;
const wallHeight = 30;
function makeWall(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, wallMat);
  m.position.set(x,y,z);
  scene.add(m);
  collidables.push({ mesh: m, box: new THREE.Box3().setFromObject(m) });
}
// left, right, front, back, ceiling
const topY = wallHeight/2 - 0.5;
makeWall( WORLD_HALF_SIZE*2 + wallThickness*2, wallHeight, wallThickness, 0, topY, -WORLD_HALF_SIZE - wallThickness/2 );
makeWall( WORLD_HALF_SIZE*2 + wallThickness*2, wallHeight, wallThickness, 0, topY, WORLD_HALF_SIZE + wallThickness/2 );
makeWall( wallThickness, wallHeight, WORLD_HALF_SIZE*2, -WORLD_HALF_SIZE - wallThickness/2, topY, 0 );
makeWall( wallThickness, wallHeight, WORLD_HALF_SIZE*2, WORLD_HALF_SIZE + wallThickness/2, topY, 0 );
makeWall( WORLD_HALF_SIZE*2 + wallThickness*2, wallThickness, WORLD_HALF_SIZE*2 + wallThickness*2, 0, wallHeight - wallThickness/2 - 0.5, 0 );

// create 1000 blocks scattered in the interior
const blockGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const blockMat = new THREE.MeshStandardMaterial({ color: 0xa0522d });
const collidables = []; // {mesh, box}
const rand = (a,b)=> a + Math.random()*(b-a);

const padding = 6;
for (let i=0;i<NUM_BLOCKS;i++){
  // leave spawn area near origin free
  let x = rand(-WORLD_HALF_SIZE+padding, WORLD_HALF_SIZE-padding);
  let z = rand(-WORLD_HALF_SIZE+padding, WORLD_HALF_SIZE-padding);
  let y = BLOCK_SIZE/2; // on floor
  // small chance to stack some blocks a bit
  if (Math.random() < 0.18) y += Math.floor(Math.random()*3)*(BLOCK_SIZE);
  const m = new THREE.Mesh(blockGeo, blockMat);
  m.position.set(Math.round(x/ (BLOCK_SIZE))*BLOCK_SIZE, y, Math.round(z/ (BLOCK_SIZE))*BLOCK_SIZE);
  scene.add(m);
  collidables.push({ mesh: m, box: new THREE.Box3().setFromObject(m) });
}

// Player state
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let canJump = false;
let onGround = false;

// movement keys
const keys = { w:false, a:false, s:false, d:false };
let lastWTap = 0;
let sprinting = false;

// Pointer lock & mouse look
const canvas = renderer.domElement;
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
startBtn.addEventListener('click', ()=> {
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  overlay.style.display = locked ? 'none' : 'block';
});

// mouse movement rotates camera (we rotate a "yaw" and "pitch" object)
const yaw = new THREE.Object3D();
const pitch = new THREE.Object3D();
yaw.add(pitch);
pitch.add(camera);
scene.add(yaw);

// clamp pitch
let pitchX = 0;
document.addEventListener('mousemove', (e)=>{
  if (document.pointerLockElement !== canvas) return;
  const movementX = e.movementX || 0;
  const movementY = e.movementY || 0;
  yaw.rotation.y -= movementX * 0.0025;
  pitchX -= movementY * 0.0025;
  pitchX = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, pitchX));
  pitch.rotation.x = pitchX;
});

// keyboard
document.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key.toLowerCase() === 'w') {
    // double tap detection
    const now = performance.now();
    if (now - lastWTap < 300) {
      sprinting = true;
    }
    lastWTap = now;
    keys.w = true;
  } else if (e.key.toLowerCase() === 'a'){ keys.a=true; }
  else if (e.key.toLowerCase() === 's'){ keys.s=true; }
  else if (e.key.toLowerCase() === 'd'){ keys.d=true; }
  else if (e.code === 'Space') {
    if (canJump || onGround) {
      velocity.y = JUMP_V;
      canJump = false;
      onGround = false;
    }
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'w') { keys.w=false; sprinting = false; }
  else if (e.key.toLowerCase() === 'a'){ keys.a=false; }
  else if (e.key.toLowerCase() === 's'){ keys.s=false; }
  else if (e.key.toLowerCase() === 'd'){ keys.d=false; }
});

// Resize
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Collision helpers
function playerAABBAt(pos){
  // approximate player as a vertical capsule with radius and height
  const min = new THREE.Vector3(pos.x - PLAYER_RADIUS, pos.y - PLAYER_HEIGHT, pos.z - PLAYER_RADIUS);
  const max = new THREE.Vector3(pos.x + PLAYER_RADIUS, pos.y + PLAYER_HEIGHT*0.1, pos.z + PLAYER_RADIUS);
  return new THREE.Box3(min, max);
}

function intersectsAny(aabb){
  for (let c of collidables){
    c.box.setFromObject(c.mesh);
    if (aabb.intersectsBox(c.box)) return true;
  }
  return false;
}

// main loop
const clock = new THREE.Clock();
function animate(){
  const dt = Math.min(0.05, clock.getDelta());
  // movement input -> direction vector in local space
  direction.set(0,0,0);
  if (keys.w) direction.z -= 1;
  if (keys.s) direction.z += 1;
  if (keys.a) direction.x -= 1;
  if (keys.d) direction.x += 1;
  if (direction.lengthSq() > 0) direction.normalize();

  // transform direction by yaw
  const move = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0), yaw.rotation.y);
  move.copy(direction).applyQuaternion(quaternion);

  // speed
  let speed = MOVE_SPEED;
  if (sprinting && keys.w) speed *= SPRINT_MULT;
  // apply to velocity (horizontal)
  velocity.x = move.x * speed;
  velocity.z = move.z * speed;

  // gravity
  velocity.y += GRAVITY * dt;

  // predicted new position
  const oldPos = new THREE.Vector3();
  oldPos.setFromMatrixPosition(yaw.matrixWorld); // yaw is parent of camera, but position not stored; instead store our own position
  // we will keep position separately
  if (!playerPos) playerPos = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
  const proposed = playerPos.clone().addScaledVector(velocity, dt);

  // simple ground collision with floor (y = PLAYER_HEIGHT)
  if (proposed.y <= PLAYER_HEIGHT) {
    proposed.y = PLAYER_HEIGHT;
    velocity.y = 0;
    onGround = true;
    canJump = true;
  } else {
    onGround = false;
  }

  // horizontal collisions: test X then Z separately to avoid getting stuck
  // test x
  const testX = proposed.clone();
  testX.z = playerPos.z; testX.y = Math.max(proposed.y, playerPos.y);
  const aabbX = playerAABBAt(testX);
  if (intersectsAny(aabbX) || Math.abs(testX.x) > WORLD_HALF_SIZE - 1) {
    proposed.x = playerPos.x; // block X movement
    velocity.x = 0;
  }
  // test z
  const testZ = proposed.clone();
  testZ.x = playerPos.x; testZ.y = Math.max(proposed.y, playerPos.y);
  const aabbZ = playerAABBAt(testZ);
  if (intersectsAny(aabbZ) || Math.abs(testZ.z) > WORLD_HALF_SIZE - 1) {
    proposed.z = playerPos.z;
    velocity.z = 0;
  }

  // vertical collisions with blocks (e.g. hitting head)
  const aabbY = playerAABBAt(proposed);
  if (intersectsAny(aabbY)) {
    // simple response: cancel vertical velocity and place player just above current pos
    // try to move up a bit to resolve by checking incremental steps
    let resolved = false;
    for (let dy = 0; dy <= 2; dy += 0.1){
      const attempt = proposed.clone();
      attempt.y += dy;
      if (!playerAABBAt(attempt).intersectsBox) {
        proposed.y = attempt.y;
        resolved = true;
        break;
      }
    }
    velocity.y = Math.min(velocity.y, 0);
  }

  // commit position
  playerPos.copy(proposed);

  // update camera parent (yaw) position
  yaw.position.set(playerPos.x, playerPos.y, playerPos.z);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// maintain player position separate from yaw.matrixWorld
let playerPos = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
yaw.position.copy(playerPos);

// update collidable boxes once for initial
for (let c of collidables) c.box = new THREE.Box3().setFromObject(c.mesh);

animate();
