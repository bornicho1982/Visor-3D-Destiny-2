import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as zip from '@zip.js/zip.js'; // Import zip.js
window.zip = zip; // Expose globally for loader

import { TGXLoader } from './three.tgxloader.js';
import BungieAuth, {
    isAuthenticated,
    startOAuthFlow,
    handleOAuthCallback,
    getCurrentUserMembership,
    getCharacterEquipment,
    parseEquipmentForLoader,
    API_KEY
} from './BungieAuth.js';

// === CONFIGURACIÓN ===
const ITEM_HASH = 1345867571; // Ace of Spades (fallback if not authenticated)

// === 1. ESCENA THREE.JS ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);
window.scene = scene; // DEBUG: Expose globally for inspection

// Cámara
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 2.5);
window.camera = camera;

// Render
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Luces
const ambient = new THREE.HemisphereLight(0xffffff, 0x222222, 1.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 5, 5);
scene.add(sun);

// Controles
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
window.controls = controls;

// Loop - only render when model is ready
window.modelLoaded = false;
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (window.modelLoaded) {
        renderer.render(scene, camera);
    }
}
animate();

// === 2. UI FUNCTIONS ===
function showLoginButton() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.style.display = 'block';
        loginBtn.onclick = () => startOAuthFlow();
    }
}

function hideLoginButton() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.style.display = 'none';
}

function updateStatus(message) {
    const status = document.getElementById('status');
    if (status) status.textContent = message;
}

function showCharacterSelector(characters, onSelect) {
    const container = document.getElementById('characterSelector');
    if (!container) return;

    container.innerHTML = '<h3>Selecciona un Personaje</h3>';
    container.style.display = 'block';

    const CLASS_NAMES = ['Titán', 'Cazador', 'Hechicero'];

    for (const [charId, char] of Object.entries(characters)) {
        const btn = document.createElement('button');
        btn.className = 'character-btn';
        btn.innerHTML = `
            <img src="https://www.bungie.net${char.emblemPath}" alt="emblem">
            <span>${CLASS_NAMES[char.classType]} - ${char.light}✦</span>
        `;
        btn.onclick = () => {
            container.style.display = 'none';
            onSelect(charId, char);
        };
        container.appendChild(btn);
    }
}

// === 3. SHADER COLOR LOADING ===
/**
 * Fetch shader gear asset to get its custom_dyes with material_properties
 * This contains the actual RGB colors for the shader
 * Uses TGXManifest.getAsset() which queries the local SQLite manifest
 */
async function loadShaderDyes(shaderHash) {
    if (!shaderHash || shaderHash === 0) {
        console.log('[Shader] No shader hash provided, no shader colors to load');
        return null;
    }

    console.log(`[Shader] Loading shader gear asset for hash ${shaderHash}...`);

    // Ensure TGXLoader and manifest are available
    if (!window.THREE || !THREE.TGXLoader) {
        console.warn('[Shader] TGXLoader not available yet');
        return null;
    }

    // Get or create manifest instance
    let manifest = THREE.TGXLoader.Manifest;
    if (!manifest) {
        console.log('[Shader] Manifest not loaded yet, initializing...');

        // Create manifest with same options as the loader uses
        manifest = new THREE.TGXManifest(THREE.DefaultLoadingManager, {
            apiKey: API_KEY,
            apiBasepath: '/bungie/d1/Platform/Destiny',
            apiBasepath2: '/bungie/Platform/Destiny2',
            basepath: '/bungie'
        });
        THREE.TGXLoader.Manifest = manifest;
    }

    return new Promise((resolve) => {
        try {
            manifest.getAsset(shaderHash, function (data) {
                console.log('[Shader] Got shader gear asset from manifest:', data);

                if (!data || !data.gearAsset) {
                    console.warn('[Shader] No gear asset data for shader');
                    resolve(null);
                    return;
                }

                const gearAsset = data.gearAsset;

                // Extract custom_dyes which contain the material_properties with colors
                if (gearAsset.custom_dyes && gearAsset.custom_dyes.length > 0) {
                    console.log('[Shader] Found custom_dyes:', gearAsset.custom_dyes.length);

                    // Log the colors for debugging
                    gearAsset.custom_dyes.forEach((dye, idx) => {
                        if (dye.material_properties) {
                            const mp = dye.material_properties;
                            console.log(`[Shader] Dye ${idx} colors:`,
                                'primary:', mp.primary_albedo_tint,
                                'secondary:', mp.secondary_albedo_tint,
                                'worn:', mp.secondary_worn_albedo_tint || mp.primary_worn_albedo_tint
                            );
                        }
                    });

                    resolve(gearAsset.custom_dyes);
                    return;
                }

                // Also check default_dyes
                if (gearAsset.default_dyes && gearAsset.default_dyes.length > 0) {
                    console.log('[Shader] Found default_dyes:', gearAsset.default_dyes.length);
                    resolve(gearAsset.default_dyes);
                    return;
                }

                console.log('[Shader] No dyes found in shader gear asset');
                resolve(null);

            }, undefined, function (err) {
                console.warn('[Shader] Error getting shader asset:', err);
                resolve(null);
            });
        } catch (err) {
            console.error('[Shader] Error loading shader dyes:', err);
            resolve(null);
        }
    });
}


// === 4. MODEL LOADING ===
async function loadModel(itemHash, options = {}) {
    console.log(`[Loader] Loading item ${itemHash}...`);

    updateStatus(`Cargando modelo ${itemHash}...`);

    TGXLoader.APIKey = API_KEY;
    TGXLoader.Platform = 'mobile';
    TGXLoader.Basepath = '/bungie';
    TGXLoader.APIBasepath = '/bungie/d1/Platform/Destiny';
    TGXLoader.APIBasepath2 = '/bungie/Platform/Destiny2';
    TGXLoader.Game = 'destiny2';

    const loader = new TGXLoader();

    return new Promise((resolve, reject) => {
        // Pass options object with skeleton loading enabled
        const loaderOptions = {
            itemHash: itemHash,
            loadSkeleton: false, // Disabled until we have the local skeleton file
            loadAnimation: false, // TODO: Enable when animation loading is fixed
            loadTextures: true,
            classHash: options.classHash || 0,
            isFemale: options.isFemale || false,
            ...options
        };

        loader.load(loaderOptions, async (geometry, materials, animations) => {
            console.log("[Loader] Model downloaded. Creating mesh...");
            // THREE.Geometry uses vertices, not attributes (r124)
            console.log("[Loader] Geometry vertices:", geometry.vertices ? geometry.vertices.length : 0);
            console.log("[Loader] Has bones:", geometry.bones ? geometry.bones.length : 0);
            console.log("[Loader] Animations:", animations ? animations.length : 0);

            // Use DestinyMaterial for proper texture handling
            const { convertTGXMaterials } = await import('./DestinyMaterial.js');
            const destinyMaterials = convertTGXMaterials(materials);
            console.log("[Loader] Materials converted:", destinyMaterials.length);

            let mesh;

            // Check if we have skeleton data
            if (geometry.bones && geometry.bones.length > 0) {
                console.log("[Loader] Creating SkinnedMesh with", geometry.bones.length, "bones");

                // Create THREE.Bone hierarchy
                const threeBones = [];
                geometry.bones.forEach((boneData, i) => {
                    const bone = new THREE.Bone();
                    bone.name = boneData.name || `bone_${i}`;
                    bone.position.fromArray(boneData.pos || [0, 0, 0]);
                    bone.quaternion.fromArray(boneData.rotq || [0, 0, 0, 1]);
                    bone.scale.fromArray(boneData.scl || [1, 1, 1]);
                    threeBones.push(bone);
                });

                // Set up parent-child hierarchy
                geometry.bones.forEach((boneData, i) => {
                    if (boneData.parent >= 0 && boneData.parent < threeBones.length) {
                        threeBones[boneData.parent].add(threeBones[i]);
                    }
                });

                // Create skeleton
                const skeleton = new THREE.Skeleton(threeBones);
                console.log("[Loader] Skeleton created with", skeleton.bones.length, "bones");

                // Convert THREE.Geometry to BufferGeometry for SkinnedMesh
                // SkinnedMesh requires BufferGeometry even in r124
                let bufferGeometry;
                if (geometry.isBufferGeometry) {
                    bufferGeometry = geometry;
                } else if (geometry.toBufferGeometry) {
                    console.log("[Loader] Converting Geometry to BufferGeometry...");
                    bufferGeometry = geometry.toBufferGeometry();
                } else {
                    console.log("[Loader] Using BufferGeometry.fromGeometry()...");
                    bufferGeometry = new THREE.BufferGeometry().fromGeometry(geometry);
                }

                // Copy skin data from Geometry to BufferGeometry (fromGeometry doesn't do this)
                if (geometry.skinIndices && geometry.skinIndices.length > 0) {
                    console.log("[Loader] Copying skin data,", geometry.skinIndices.length, "skin indices");
                    const skinIndexArray = new Float32Array(geometry.skinIndices.length * 4);
                    const skinWeightArray = new Float32Array(geometry.skinWeights.length * 4);

                    for (let i = 0; i < geometry.skinIndices.length; i++) {
                        const idx = geometry.skinIndices[i];
                        const weight = geometry.skinWeights[i];
                        skinIndexArray[i * 4] = idx.x;
                        skinIndexArray[i * 4 + 1] = idx.y;
                        skinIndexArray[i * 4 + 2] = idx.z;
                        skinIndexArray[i * 4 + 3] = idx.w;
                        skinWeightArray[i * 4] = weight.x;
                        skinWeightArray[i * 4 + 1] = weight.y;
                        skinWeightArray[i * 4 + 2] = weight.z;
                        skinWeightArray[i * 4 + 3] = weight.w;
                    }

                    bufferGeometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndexArray, 4));
                    bufferGeometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeightArray, 4));
                    console.log("[Loader] Skin data copied to BufferGeometry");
                } else {
                    console.warn("[Loader] No skin data found in original geometry");
                }

                console.log("[Loader] BufferGeometry ready:", Object.keys(bufferGeometry.attributes));

                // Create SkinnedMesh with BufferGeometry
                mesh = new THREE.SkinnedMesh(bufferGeometry, destinyMaterials.length > 0 ? destinyMaterials : materials);

                // Find root bone (no parent or parent is -1)
                let rootBone = threeBones[0];
                geometry.bones.forEach((boneData, i) => {
                    if (boneData.parent < 0 || boneData.parent === undefined) {
                        rootBone = threeBones[i];
                    }
                });

                mesh.add(rootBone);
                mesh.bind(skeleton);

                console.log("[Loader] SkinnedMesh created and bound to skeleton");

                // Optional: Add skeleton helper for debugging
                // const skeletonHelper = new THREE.SkeletonHelper(mesh);
                // mesh.add(skeletonHelper);

            } else {
                console.log("[Loader] No bones found, creating regular Mesh");
                mesh = new THREE.Mesh(geometry, destinyMaterials.length > 0 ? destinyMaterials : materials);
            }

            mesh.name = `item_${itemHash}`;
            resolve(mesh);

        }, (progress) => {
            if (progress.total) {
                const pct = Math.floor(progress.loaded / progress.total * 100);
                updateStatus(`Cargando: ${pct}%`);
            }
        }, (err) => {
            console.error("[Loader] Error:", err);
            reject(err);
        });
    });
}

function addGroupToScene(group) {
    try {
        // Clear previous models
        const toRemove = [];
        scene.traverse(obj => {
            if (obj.name === 'characterGroup' || (obj.isMesh && obj.name.startsWith('item_'))) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => scene.remove(obj));

        // Add new group
        scene.add(group);

        // Compute bounding box for SkinnedMesh - need to update geometry first
        group.traverse(obj => {
            if (obj.isSkinnedMesh || obj.isMesh) {
                if (obj.geometry && !obj.geometry.boundingBox) {
                    obj.geometry.computeBoundingBox();
                }
            }
        });

        // Compute bounding box for proper framing
        const box = new THREE.Box3().setFromObject(group);

        let size = box.getSize(new THREE.Vector3());
        let center = box.getCenter(new THREE.Vector3());
        let maxDim = Math.max(size.x, size.y, size.z);

        // Fallback if bounding box calculation fails
        if (!isFinite(maxDim) || maxDim <= 0) {
            console.warn("[Scene] Invalid bounding box, using defaults");
            maxDim = 2;
            center.set(0, 1, 0);
        }

        // Auto-scale (Destiny models are often large/small, normalize to ~2 units height)
        let scaleFactor = 1;

        // For now, keep scale 1 unless it's tiny
        if (maxDim < 0.5 && maxDim > 0) scaleFactor = 1 / maxDim;

        group.scale.set(scaleFactor, scaleFactor, scaleFactor);

        // Re-center
        const scaledCenter = center.clone().multiplyScalar(scaleFactor);
        group.position.set(-scaledCenter.x, -scaledCenter.y, -scaledCenter.z);

        // Position camera
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = (maxDim * scaleFactor) / (2 * Math.tan(fov / 2)) * 1.5;

        camera.position.set(0, 0, Math.max(cameraDistance, 2));
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();

        window.mesh = group;
        window.modelLoaded = true;

        console.log("[Scene] Character added, count:", group.children.length);
    } catch (err) {
        console.error("[Scene] Error in addGroupToScene:", err);
        // Still try to add the group even if framing fails
        if (!group.parent) {
            scene.add(group);
        }
    }

    // Always hide loading overlay, even if there were errors
    updateStatus('');
    console.log("[Scene] Hiding loading overlay...");
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'none';
        console.log("[Scene] Loading overlay hidden");
    } else {
        console.warn("[Scene] Loading element not found");
    }
}

function addMeshToScene(mesh) {
    // Wrap single mesh in a group and use addGroupToScene
    const group = new THREE.Group();
    group.name = 'characterGroup';
    group.add(mesh);
    addGroupToScene(group);
}

// === 4. MAIN INIT ===
async function init() {
    console.log("=== Visor Destiny 2 ===");

    // Check if this is an OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('code')) {
        // This is a callback, but we handle it in callback.html
        // If somehow we got here, redirect
        window.location.href = '/callback.html' + window.location.search;
        return;
    }

    // Check authentication status
    if (isAuthenticated()) {
        console.log("[Auth] User is authenticated");
        hideLoginButton();
        updateStatus('Obteniendo datos del perfil...');

        try {
            // Get membership info
            const membership = await getCurrentUserMembership();
            console.log("[Auth] Membership:", membership);

            // Get character equipment
            const profileData = await getCharacterEquipment(
                membership.membershipType,
                membership.membershipId
            );
            console.log("[Auth] Profile data received");

            // Show character selector
            const characters = profileData.characters.data;
            showCharacterSelector(characters, async (charId, char) => {
                updateStatus('Cargando personaje...');

                const equipment = parseEquipmentForLoader(profileData, charId);
                console.log("[Equipment] Parsed:", equipment);

                // Load all equipped armor
                if (equipment.itemHashes.length > 0) {
                    const characterGroup = new THREE.Group();
                    characterGroup.name = 'characterGroup';

                    let loadedCount = 0;
                    const totalItems = equipment.itemHashes.length;

                    for (let i = 0; i < equipment.itemHashes.length; i++) {
                        const itemHash = equipment.itemHashes[i];
                        const shaderHash = equipment.shaderHashes ? equipment.shaderHashes[i] : 0;
                        const itemDyes = equipment.itemDyes ? equipment.itemDyes[i] : [];

                        try {
                            // If shader is equipped, load its dyes with color data
                            let shaderDyes = null;
                            if (shaderHash && shaderHash !== 0) {
                                console.log(`[Loader] Loading shader ${shaderHash} dyes for item ${itemHash}...`);
                                shaderDyes = await loadShaderDyes(shaderHash);
                            }

                            console.log(`[Loader] Loading item ${itemHash} with shader ${shaderHash}, shaderDyes:`, shaderDyes?.length || 0);
                            const mesh = await loadModel(itemHash, {
                                shaderHash: shaderHash,
                                itemDyes: itemDyes,
                                shaderDyes: shaderDyes // Pass shader's custom_dyes with material_properties
                            });
                            characterGroup.add(mesh);
                            loadedCount++;
                            updateStatus(`Cargando equipo: ${loadedCount}/${totalItems}`);
                        } catch (err) {
                            console.error(`[Loader] Failed to load item ${itemHash}:`, err);
                            // Continue with other items even if one fails
                        }
                    }


                    if (characterGroup.children.length > 0) {
                        addGroupToScene(characterGroup);
                    } else {
                        updateStatus('Error: No se pudo cargar ninguna pieza de armadura.');
                    }

                } else {
                    updateStatus('No se encontró armadura equipada');
                }
            });

        } catch (err) {
            console.error("[Auth] Error loading profile:", err);
            updateStatus('Error cargando perfil. Usa modelo de prueba.');
            showLoginButton();

            // Load test model as fallback
            try {
                const mesh = await loadModel(ITEM_HASH);
                addMeshToScene(mesh);
            } catch (e) {
                updateStatus('Error cargando modelo');
            }
        }

    } else {
        console.log("[Auth] User not authenticated");
        showLoginButton();
        updateStatus('Inicia sesión para cargar tu personaje, o usa el modelo de prueba');

        // Load test model
        try {
            const mesh = await loadModel(ITEM_HASH);
            addMeshToScene(mesh);
        } catch (err) {
            console.error("[Loader] Error loading test model:", err);
            updateStatus('Error cargando modelo de prueba');
        }
    }
}

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Wait for SQL.js then init
const checkLibs = setInterval(() => {
    if (window.SQL) {
        clearInterval(checkLibs);
        console.log("SQL.js cargado. Iniciando...");
        init();
    }
}, 100);
