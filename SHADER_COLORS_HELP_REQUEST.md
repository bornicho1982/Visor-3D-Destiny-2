# Destiny 2 3D Character Viewer - Need Help with Shader Colors

## Update - Tried Sol_Unshadowed's Suggestion

Thanks for the help Sol! I tried loading the `asset_sql_content` database from `mobileAssetContentPath` but the shaders are still not found.

What I did:
1. Loaded `mobileAssetContentPath` database (736KB, asset_sql_content_96bceafd...)
2. Found table `DestinyGearAssetsDefinition` in it
3. Queried for shader hashes - not found

Console output:
```
[TGXManifest] asset_sql_content database loaded, size: 736256
[TGXManifest] asset_sql_content tables: ['DestinyGearAssetsDefinition']
[getGearDyes] Attempting to load shaderDyes from asset_sql_content for shader: 3832366019
[getGearDyes] Shader not found in asset_sql_content: 3832366019
```

My question: Could it be that `mobileAssetContentPath` doesn't include shaders, but the web/desktop version does? 

I'm currently using:
- `mobileGearAssetDataBases` - for armor gear assets (works)
- `mobileAssetContentPath` - for shader lookup (shaders not found)

Is there another database or endpoint I should use for mobile platform?

---

## Project Goal

I'm building a web-based 3D viewer for Destiny 2 characters that loads armor directly from the Bungie API using OAuth authentication. The viewer successfully loads and renders the user's equipped armor, but shader colors are not being applied - all armor renders with default white/grey colors instead of the actual shader colors the player has equipped.

---

## Tools and Technologies I'm Using

Core Libraries:
- THREE.js - 3D rendering engine
- TGXLoader - Based on lowlidev's original work, adapted for D2 mobile platform
- SQL.js - For querying the SQLite manifest database in-browser
- Bungie API - OAuth 2.0 authentication + REST endpoints

API Endpoints:
```
GET /Platform/Destiny2/Manifest/
GET /Platform/Destiny2/{membershipType}/Profile/{membershipId}/?components=100,200,205,302
GET /Platform/Destiny2/{membershipType}/Profile/{membershipId}/Character/{characterId}/?components=205
```

---

## What's Working

Authentication and Character Data:
- OAuth 2.0 login with Bungie.net
- Fetching user profile and characters
- Getting equipped items (component 205 - CharacterEquipment)
- Getting character render data (characterRenderData)

Model Loading (Mobile Platform):
- Loading `mobileGearAssetDataBases` SQLite manifest
- Querying `DestinyGearAssetsDefinition` table for armor items
- Loading geometry (TGX files)
- Loading textures (diffuse, normal, gearstack)
- Rendering 3D meshes in THREE.js

Data I Can Access:

From characterRenderData.peerView.equipment:
```javascript
{
  itemHash: 4112577340,
  dyes: [
    { dyeHash: 3807608073, channelHash: 1667433279 },
    { dyeHash: 3807608073, channelHash: 1667433280 },
    { dyeHash: 3807608073, channelHash: 1667433281 }
  ]
}
```

From characterEquipment (shader detection):
```javascript
shaderHash: 2175577211
```

From gear asset content (dye_index_set):
```javascript
{
  dye_index_set: {
    textures: [
      { diffuse: {...}, normal: {...}, gearstack: {...}, dyeslot: {...} }
    ],
    geometry: []
  }
}
```

---

## The Problem: Missing Shader Colors

What I need - the shader data should contain RGB values in material_properties:
```javascript
{
  custom_dyes: [{
    material_properties: {
      primary_albedo_tint: [0.8, 0.2, 0.1],
      secondary_albedo_tint: [0.1, 0.1, 0.1],
      worn_albedo_tint: [0.5, 0.4, 0.3]
    }
  }]
}
```

What I'm getting when loading armor items from the mobile manifest:
```javascript
{
  custom_dyes: [],
  default_dyes: [],
  locked_dyes: []
}
```

The `dye_index_set` contains texture references only, not the actual RGB color values.

---

## What I've Tried

Attempt 1: Direct dye lookup in manifest
- Looked for dye tables in `mobileGearAssetDataBases` SQLite
- Result: Only table available is `DestinyGearAssetsDefinition`
- Shaders are NOT included in this table

```
[TGXManifest] Available tables: ['DestinyGearAssetsDefinition']
[getGearDyes] Shader not found in manifest: 2175577211
```

Attempt 2: Load shader as separate gear asset
Based on Discord discussions, tried loading the shader hash as a gear asset:
```javascript
THREE.TGXManifest.getAsset(shaderHash, callback);
```
Result: Shader not found in manifest - shaders don't have gear asset entries in mobile manifest

Attempt 3: Use mobileAssetContentPath database (Sol's suggestion)
Loaded the `asset_sql_content` database from `mobileAssetContentPath`
```
[TGXManifest] asset_sql_content database loaded, size: 736256
[TGXManifest] asset_sql_content tables: ['DestinyGearAssetsDefinition']
```
Result: Same table, shaders still not found

Attempt 4: Use DestinyArtDyeReferenceDefinition
Loaded the JSON API for dye definitions:
```javascript
// URL: /common/destiny2_content/json/en/DestinyArtDyeReferenceDefinition-{hash}.json
{
  artDyeHash: 74203,
  dyeManifestHash: 2334041051,
  hash: 74203,
  index: 16703,
  redacted: false,
  blacklisted: false
}
```
Result: No RGB color data - only references to dyeManifestHash

Attempt 5: Use itemDyes from peerView
The dyes from `characterRenderData.peerView.equipment[].dyes[]`:
```javascript
{ dyeHash: 3807608073, channelHash: 1667433279 }
```
Result: These are just hash references, not actual color values

---

## Console Logs

```
[Equipment] HELMET dyes: [{dyeHash: X, channelHash: Y}, ...]
[Loader] Loading item 4112577340 with shader 2175577211, shaderDyes: 0

[Parse] contentLoaded.itemDyes: (3) [{...}, {...}, {...}]
[Parse] contentLoaded.shaderDyes: []

[getGearDyes] Found dye_index_set (D2 Mobile): {textures: Array(7), geometry: Array(0)}
[getGearDyes] Attempting to load shaderDyes from asset_sql_content for shader: 2175577211
[getGearDyes] Shader not found in asset_sql_content: 2175577211
[getGearDyes] No shaderDyes available, using white fallback

Material 0: {primaryColor: '#ffffff', ...}
```

---

## Current Result

- Models load correctly with proper geometry
- Textures (diffuse, normal, gearstack) are applied
- All armor is WHITE/GREY instead of shader colors
- No way to get primary_albedo_tint, secondary_albedo_tint, worn_albedo_tint values

---

## Questions

1. Where are shader colors stored?
   - Is there another API endpoint that returns shader color data?
   - Is there a different manifest for shaders on mobile platform?

2. How does Paracausal Forge get shader colors?
   - Do you extract colors from game files directly?
   - Is there a public API I'm missing?

3. Mobile vs Web platform differences
   - Does the web platform manifest have different dye data than mobile?
   - Should I be using a different database path?

4. What does dyeManifestHash point to?
   - The DestinyArtDyeReferenceDefinition has dyeManifestHash - what manifest is that referencing?

---

## Technical Setup

Project Structure:
```
Visor 3D Destiny 2/
├── index.js           # Main loader, scene setup
├── three.tgxloader.js # Modified TGXLoader for D2 mobile
├── BungieAuth.js      # OAuth and API calls
├── DestinyMaterial.js # Material/shader processing
└── vite.config.js     # Proxy for Bungie API
```

TGXLoader Configuration:
```javascript
{
  game: 'destiny2',
  platform: 'mobile',
  loadTextures: true,
  shaderHash: 2175577211,
  itemDyes: [{dyeHash, channelHash}, ...]
}
```

---

## Example Shader Hashes I'm Testing

- 3832366019
- 3820147479
- 1803434835
- 1133590731
- 3200810407

None of these are found in `DestinyGearAssetsDefinition` table in either `mobileGearAssetDataBases` or `mobileAssetContentPath`.

---

Any help would be appreciated. I've been stuck on this for a while and the models look great except for the missing shader colors.
