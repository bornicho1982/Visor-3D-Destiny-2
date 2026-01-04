/**
 * BungieAuth.js - OAuth 2.0 Authentication for Bungie API
 * 
 * Handles:
 * - OAuth authorization flow
 * - Token storage and refresh
 * - API calls with authentication
 */

// OAuth Configuration from environment variables (see .env.example)
const OAUTH_CONFIG = {
    clientId: import.meta.env.VITE_BUNGIE_CLIENT_ID,
    clientSecret: import.meta.env.VITE_BUNGIE_CLIENT_SECRET,
    authorizationUrl: 'https://www.bungie.net/es/OAuth/Authorize',
    tokenUrl: 'https://www.bungie.net/Platform/App/OAuth/token/',
    redirectUri: import.meta.env.VITE_BUNGIE_REDIRECT_URI || 'https://localhost:55555/callback',
    apiKey: import.meta.env.VITE_BUNGIE_API_KEY
};


// Token storage keys
const TOKEN_STORAGE_KEY = 'bungie_oauth_tokens';
const MEMBERSHIP_STORAGE_KEY = 'bungie_membership';

/**
 * Get stored tokens from localStorage
 */
export function getStoredTokens() {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    try {
        const tokens = JSON.parse(stored);

        // Check if access token is expired
        if (tokens.expiresAt && Date.now() > tokens.expiresAt) {
            console.log('[Auth] Access token expired, needs refresh');
            // Could implement refresh here, but for now just clear
            return null;
        }

        return tokens;
    } catch (e) {
        console.error('[Auth] Failed to parse stored tokens:', e);
        return null;
    }
}

/**
 * Store tokens in localStorage
 */
export function storeTokens(tokenResponse) {
    const tokens = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        membershipId: tokenResponse.membership_id
    };

    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    console.log('[Auth] Tokens stored, expires at:', new Date(tokens.expiresAt));

    return tokens;
}

/**
 * Clear stored tokens (logout)
 */
export function clearTokens() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(MEMBERSHIP_STORAGE_KEY);
    console.log('[Auth] Tokens cleared');
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
    return getStoredTokens() !== null;
}

/**
 * Start OAuth authorization flow
 * Redirects user to Bungie login page
 */
export function startOAuthFlow() {
    // Generate random state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('oauth_state', state);

    const authUrl = new URL(OAUTH_CONFIG.authorizationUrl);
    authUrl.searchParams.set('client_id', OAUTH_CONFIG.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    // Note: Bungie uses the registered redirect_uri, we don't need to specify it

    console.log('[Auth] Redirecting to Bungie OAuth:', authUrl.toString());
    window.location.href = authUrl.toString();
}

/**
 * Handle OAuth callback
 * Called when user returns from Bungie login
 */
export async function handleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
        console.error('[Auth] OAuth error:', error);
        throw new Error(`OAuth error: ${error}`);
    }

    if (!code) {
        console.log('[Auth] No authorization code in URL');
        return null;
    }

    // Verify state
    const storedState = sessionStorage.getItem('oauth_state');
    if (state !== storedState) {
        console.error('[Auth] State mismatch - possible CSRF attack');
        throw new Error('Invalid OAuth state');
    }
    sessionStorage.removeItem('oauth_state');

    console.log('[Auth] Exchanging code for tokens...');

    // Exchange code for tokens
    const tokenResponse = await fetch('/bungie/Platform/App/OAuth/token/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-API-Key': OAUTH_CONFIG.apiKey
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: OAUTH_CONFIG.clientId,
            client_secret: OAUTH_CONFIG.clientSecret
        })
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('[Auth] Token exchange failed:', errorText);
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[Auth] Token exchange successful');

    // Store tokens
    const tokens = storeTokens(tokenData);

    // Clear the URL of OAuth params
    window.history.replaceState({}, document.title, window.location.pathname);

    return tokens;
}

/**
 * Make an authenticated API request to Bungie
 */
export async function fetchWithAuth(endpoint, options = {}) {
    const tokens = getStoredTokens();

    if (!tokens) {
        throw new Error('Not authenticated');
    }

    const headers = {
        'X-API-Key': OAUTH_CONFIG.apiKey,
        'Authorization': `Bearer ${tokens.accessToken}`,
        ...options.headers
    };

    const response = await fetch(`/bungie${endpoint}`, {
        ...options,
        headers
    });

    if (response.status === 401) {
        console.log('[Auth] Token expired, clearing tokens');
        clearTokens();
        throw new Error('Authentication expired');
    }

    return response;
}

/**
 * Get current user's Destiny 2 membership info
 */
export async function getCurrentUserMembership() {
    // Check cache first
    const cached = localStorage.getItem(MEMBERSHIP_STORAGE_KEY);
    if (cached) {
        return JSON.parse(cached);
    }

    const response = await fetchWithAuth('/Platform/User/GetMembershipsForCurrentUser/');

    if (!response.ok) {
        throw new Error(`Failed to get memberships: ${response.status}`);
    }

    const data = await response.json();

    if (data.ErrorCode !== 1) {
        throw new Error(`Bungie API error: ${data.Message}`);
    }

    // Find Destiny 2 membership (prefer primary)
    const memberships = data.Response.destinyMemberships;
    const primaryMembershipId = data.Response.primaryMembershipId;

    let membership = memberships.find(m => m.membershipId === primaryMembershipId);
    if (!membership && memberships.length > 0) {
        membership = memberships[0];
    }

    if (!membership) {
        throw new Error('No Destiny 2 membership found');
    }

    const membershipInfo = {
        membershipType: membership.membershipType,
        membershipId: membership.membershipId,
        displayName: membership.bungieGlobalDisplayName || membership.displayName,
        iconPath: membership.iconPath
    };

    localStorage.setItem(MEMBERSHIP_STORAGE_KEY, JSON.stringify(membershipInfo));
    console.log('[Auth] Membership info:', membershipInfo);

    return membershipInfo;
}

/**
 * Get user's character data with equipment
 */
export async function getCharacterEquipment(membershipType, membershipId) {
    // Components: 200=Characters, 203=CharacterRenderData (customDyes), 205=CharacterEquipment, 305=ItemSockets
    const components = '200,203,205,305';

    const response = await fetchWithAuth(
        `/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=${components}`
    );

    if (!response.ok) {
        throw new Error(`Failed to get profile: ${response.status}`);
    }

    const data = await response.json();

    if (data.ErrorCode !== 1) {
        throw new Error(`Bungie API error: ${data.Message}`);
    }

    return data.Response;
}

/**
 * Parse character equipment for 3D rendering
 * Returns item hashes and shader hashes for TGXLoader
 */
export function parseEquipmentForLoader(profileData, characterId) {
    const characters = profileData.characters.data;
    const equipment = profileData.characterEquipment.data;
    const itemSockets = profileData.itemComponents?.sockets?.data || {};

    // Get render data with custom dyes for shader colors
    const renderData = profileData.characterRenderData?.data || {};

    // Debug: Log full render data structure
    console.log('[Equipment] Full characterRenderData:', profileData.characterRenderData);
    console.log('[Equipment] Render data for character:', renderData[characterId]);

    const character = characters[characterId];
    const items = equipment[characterId]?.items || [];

    // Get dyes from peerView.equipment - each item has its own dyes array
    const peerView = renderData[characterId]?.peerView || {};
    const peerViewEquipment = peerView.equipment || [];

    // Log peerView dyes for debugging
    if (peerViewEquipment.length > 0) {
        console.log('[Equipment] PeerView equipment with dyes:', peerViewEquipment.map(e => ({
            itemHash: e.itemHash,
            dyesCount: e.dyes?.length || 0
        })));
    } else {
        console.log('[Equipment] No peerView equipment found');
    }

    // Armor bucket hashes
    const ARMOR_BUCKETS = {
        HELMET: 3448274439,
        GAUNTLETS: 3551918588,
        CHEST: 14239492,
        LEGS: 20886954,
        CLASS_ITEM: 1585787867
    };

    // Find armor pieces
    const armorItems = [];
    const shaderHashes = [];
    const itemDyes = [];  // Dyes per item from peerView

    for (const bucketName in ARMOR_BUCKETS) {
        const bucketHash = ARMOR_BUCKETS[bucketName];
        const item = items.find(i => i.bucketHash === bucketHash);

        if (item) {
            let itemHash = item.itemHash;
            let shaderHash = 0;

            // Check for ornament/shader in sockets
            const itemInstanceId = item.itemInstanceId;
            const sockets = itemSockets[itemInstanceId]?.sockets;

            if (sockets) {
                // Socket 0 or 1 might have ornament
                for (let i = 0; i <= 1; i++) {
                    if (sockets[i]?.plugHash && sockets[i]?.isEnabled) {
                        // Check if this is a different visual (ornament)
                        // In practice, ornaments change the base geometry
                        // For now we keep the base item
                    }
                }

                // Socket 3 or 4 usually has shader (varies by item)
                for (let i = 3; i <= 5; i++) {
                    if (sockets[i]?.plugHash && sockets[i]?.isVisible) {
                        shaderHash = sockets[i].plugHash;
                        break;
                    }
                }
            }

            // Find matching dyes from peerView.equipment
            const peerItem = peerViewEquipment.find(pe => pe.itemHash === itemHash);
            const dyesForItem = peerItem?.dyes || [];

            if (dyesForItem.length > 0) {
                console.log(`[Equipment] ${bucketName} dyes:`, dyesForItem);
            }

            armorItems.push({
                bucket: bucketName,
                itemHash: itemHash,
                instanceId: itemInstanceId
            });
            shaderHashes.push(shaderHash);
            itemDyes.push(dyesForItem);
        }
    }

    return {
        character: {
            classType: character.classType, // 0=Titan, 1=Hunter, 2=Warlock
            genderType: character.genderType, // 0=Male, 1=Female
            raceType: character.raceType,
            light: character.light,
            emblemPath: character.emblemPath
        },
        itemHashes: armorItems.map(a => a.itemHash),
        shaderHashes: shaderHashes,
        armorDetails: armorItems,
        itemDyes: itemDyes, // Dyes array per armor piece from peerView
        peerViewEquipment: peerViewEquipment // Full peerView equipment for reference
    };
}

// Export config for use elsewhere
export const API_KEY = OAUTH_CONFIG.apiKey;
export const CLIENT_ID = OAUTH_CONFIG.clientId;

export default {
    isAuthenticated,
    startOAuthFlow,
    handleOAuthCallback,
    getStoredTokens,
    clearTokens,
    fetchWithAuth,
    getCurrentUserMembership,
    getCharacterEquipment,
    parseEquipmentForLoader,
    API_KEY,
    CLIENT_ID
};
