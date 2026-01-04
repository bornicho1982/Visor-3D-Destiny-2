import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- CONFIGURACIÓN BÁSICA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// Clave del artículo: Usar sRGB y ToneMapping para evitar el look "lavado"
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// --- LUCES (Estudio) ---
const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 10, 7);
scene.add(sun);

// --- EL MATERIAL MÁGICO (Basado en Lowlidev) ---
// Como no tenemos el TGXLoader.js a mano, creamos un material que simula
// la recepción de colores de Bungie.
const destinyMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5,
  metalness: 0.5,
  // Aquí irían los mapas de Bungie si los tuviéramos descargados
});

// --- OBJETO DE PRUEBA (Cubo con material Destiny) ---
// Esto es solo para verificar que el motor arranca. 
// El objetivo final es reemplazar este cubo con el modelo de la API.
const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const cube = new THREE.Mesh(geometry, destinyMaterial);
cube.position.y = 1;
scene.add(cube);

// --- CONTROLES ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.y += 0.01; // Animación simple
  renderer.render(scene, camera);
}
animate();

console.log("Motor Lowlidev-Style listo.");