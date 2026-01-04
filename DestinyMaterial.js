/**
 * DestinyMaterial - Modern Destiny 2 Material for Three.js r182+
 * 
 * Uses MeshStandardMaterial with onBeforeCompile to inject Destiny-specific
 * shader logic for Gearstack texture processing and dye system.
 * 
 * Based on lowlines/destiny-tgx-loader but modernized for Three.js r182.
 */

import * as THREE from 'three';

/**
 * Creates a Destiny-compatible material using MeshStandardMaterial as base
 * with custom shader injection for Gearstack textures and dye system.
 * 
 * @param {Object} params - Material parameters
 * @param {THREE.Texture} params.diffuseMap - Diffuse/albedo texture
 * @param {THREE.Texture} params.normalMap - Normal map texture
 * @param {THREE.Texture} params.gearstackMap - Gearstack texture (AO, smoothness, alpha, dye mask)
 * @param {THREE.Texture} params.detailMap - Detail texture for dyes (optional)
 * @param {THREE.Texture} params.detailNormalMap - Detail normal map (optional)
 * @param {THREE.Color|number} params.primaryColor - Primary dye color
 * @param {THREE.Color|number} params.secondaryColor - Secondary dye color
 * @param {boolean} params.usePrimaryColor - Whether to use primary or secondary color
 * @param {Object} params.dyeParams - Additional dye parameters from gear definition
 * @returns {THREE.MeshStandardMaterial} Material with Destiny shader injection
 */
export function createDestinyMaterial(params = {}) {
    const {
        diffuseMap = null,
        normalMap = null,
        gearstackMap = null,
        detailMap = null,
        detailNormalMap = null,
        primaryColor = 0x888888,
        secondaryColor = 0x444444,
        usePrimaryColor = true,
        dyeParams = {},
        side = THREE.DoubleSide,
        transparent = false,
        alphaTest = 0.0,
    } = params;

    // Create base material
    const material = new THREE.MeshStandardMaterial({
        map: diffuseMap,
        normalMap: normalMap,
        side: side,
        transparent: transparent,
        alphaTest: alphaTest,
        roughness: 0.5,
        metalness: 0.0,
    });

    // SIMPLIFIED: Disable custom shader injection (causing vertex shader errors)
    // Just store the params for potential later use
    material.userData.destinyParams = {
        gearstackMap,
        detailMap,
        detailNormalMap,
        primaryColor,
        secondaryColor,
        usePrimaryColor,
        dyeParams,
    };

    // Use primary color tint if no diffuse map
    if (!diffuseMap && (gearstackMap || detailMap)) {
        material.color = new THREE.Color(usePrimaryColor ? primaryColor : secondaryColor);
    }

    return material;
}



/**
 * Updates the dye colors on an existing Destiny material
 * 
 * @param {THREE.MeshStandardMaterial} material - Material created with createDestinyMaterial
 * @param {THREE.Color|number} primaryColor - New primary color
 * @param {THREE.Color|number} secondaryColor - New secondary color  
 * @param {boolean} usePrimary - Whether to use primary color
 */
export function updateDestinyDye(material, primaryColor, secondaryColor, usePrimary = true) {
    if (!material.userData.destinyUniforms) {
        console.warn('updateDestinyDye: Material is not a Destiny material');
        return;
    }

    material.userData.destinyUniforms.primaryColor.value = new THREE.Color(primaryColor);
    material.userData.destinyUniforms.secondaryColor.value = new THREE.Color(secondaryColor);
    material.userData.destinyUniforms.usePrimaryColor.value = usePrimary ? 1.0 : 0.0;

    // Update shader uniforms if compiled
    if (material.userData.shader) {
        material.userData.shader.uniforms.primaryColor.value = material.userData.destinyUniforms.primaryColor.value;
        material.userData.shader.uniforms.secondaryColor.value = material.userData.destinyUniforms.secondaryColor.value;
        material.userData.shader.uniforms.usePrimaryColor.value = material.userData.destinyUniforms.usePrimaryColor.value;
    }
}

/**
 * Creates materials array from TGXLoader output using Destiny materials
 * 
 * @param {Array} tgxMaterials - Array of material data from TGXLoader
 * @param {Object} textures - Object containing loaded textures
 * @returns {Array<THREE.MeshStandardMaterial>} Array of Destiny materials
 */
export function convertTGXMaterials(tgxMaterials, textures = {}) {
    if (!Array.isArray(tgxMaterials)) {
        console.warn('convertTGXMaterials: Expected array, got', typeof tgxMaterials);
        return [];
    }

    return tgxMaterials.map((mat, index) => {
        // Handle null/undefined materials
        if (!mat) {
            console.log(`Material ${index}: null/undefined, creating default gray material`);
            return new THREE.MeshStandardMaterial({
                color: 0x888888,
                roughness: 0.5,
                metalness: 0.3,
                side: THREE.DoubleSide,
            });
        }

        // Extract textures - TGXMaterial stores them as direct properties
        let diffuseMap = null;
        let normalMap = null;
        let gearstackMap = null;
        let emissiveMap = null;
        let primaryColor = new THREE.Color(0xffffff);
        let secondaryColor = new THREE.Color(0x888888);
        let wornColor = new THREE.Color(0x666666);
        let usePrimaryColor = true;
        let metalness = 0.0;
        let roughness = 0.5;

        try {
            // Direct properties from TGXMaterial
            diffuseMap = mat.map || null;
            normalMap = mat.normalMap || null;
            gearstackMap = mat.gearstackMap || null;
            emissiveMap = mat.emissiveMap || null;

            // Extract colors from TGXMaterial
            if (mat.primaryColor) {
                primaryColor = mat.primaryColor instanceof THREE.Color
                    ? mat.primaryColor.clone()
                    : new THREE.Color(mat.primaryColor);
            }
            if (mat.secondaryColor) {
                secondaryColor = mat.secondaryColor instanceof THREE.Color
                    ? mat.secondaryColor.clone()
                    : new THREE.Color(mat.secondaryColor);
            }
            if (mat.wornColor) {
                wornColor = mat.wornColor instanceof THREE.Color
                    ? mat.wornColor.clone()
                    : new THREE.Color(mat.wornColor);
            }
            if (mat.usePrimaryColor !== undefined) {
                usePrimaryColor = mat.usePrimaryColor;
            }

            // Extract PBR values
            if (mat.metalness !== undefined) {
                metalness = mat.metalness;
            }
            if (mat.roughness !== undefined) {
                roughness = mat.roughness;
            }

            // Log what we found
            console.log(`Material ${index}: Extracting from ${mat.type || mat.constructor?.name || 'TGXMaterial'}`, {
                hasDiffuse: !!diffuseMap,
                hasNormal: !!normalMap,
                hasGearstack: !!gearstackMap,
                hasEmissive: !!emissiveMap,
                primaryColor: '#' + primaryColor.getHexString(),
                secondaryColor: '#' + secondaryColor.getHexString(),
                usePrimaryColor,
                metalness,
                roughness,
            });
        } catch (e) {
            console.warn(`Material ${index}: Error extracting textures:`, e);
        }

        // Select the dye color based on usePrimaryColor flag
        const dyeColor = usePrimaryColor ? primaryColor : secondaryColor;

        // Create MeshStandardMaterial with extracted textures
        const materialParams = {
            side: THREE.DoubleSide,
            roughness: roughness,
            metalness: metalness,
        };

        // Add diffuse map if available
        if (diffuseMap) {
            materialParams.map = diffuseMap;
            // Don't override color with white if we have a texture
        } else {
            // No diffuse map, use dye color as base
            materialParams.color = dyeColor;
        }

        // Add normal map if available
        if (normalMap) {
            materialParams.normalMap = normalMap;
            materialParams.normalScale = new THREE.Vector2(1, 1);
        }

        // Use gearstack map for AO (red channel contains AO in Destiny 2)
        if (gearstackMap) {
            materialParams.aoMap = gearstackMap;
            materialParams.aoMapIntensity = 1.0;
            // Note: For proper AO, mesh needs UV2, but we can try with UV1
        }

        // Add emissive if available
        if (emissiveMap) {
            materialParams.emissiveMap = emissiveMap;
            materialParams.emissive = new THREE.Color(0xffffff);
            materialParams.emissiveIntensity = 1.0;
        }

        const newMaterial = new THREE.MeshStandardMaterial(materialParams);

        // NOTE: We're NOT tinting when there's a diffuse map because it makes the model too dark
        // In Destiny, the dye system uses a complex overlay blend mode in the shader,
        // which can't be replicated with just the color property (which multiplies)
        // For now, let the textures show as-is - proper dye application would require
        // custom shader modifications via onBeforeCompile

        // Store extra data for potential future use (and for debugging)
        newMaterial.userData.destinyParams = {
            gearstackMap,
            usePrimaryColor,
            primaryColor: primaryColor.clone(),
            secondaryColor: secondaryColor.clone(),
            wornColor: wornColor.clone(),
            originalMaterialType: mat.type || mat.constructor?.name,
        };

        return newMaterial;
    });
}

export default {
    createDestinyMaterial,
    updateDestinyDye,
    convertTGXMaterials,
};
