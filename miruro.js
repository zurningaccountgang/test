// ==========================================
// SORA MODULE — MIRURO DEBUG / PIPE TEST
// ==========================================

const BASE_URL = "https://www.miruro.to";
const PIPE_URL = `${BASE_URL}/api/secure/pipe`;

const MIRURO_PIPE_OBF_KEY =
    "71951034f8fbcf53d89db52ceb3dc22c";

// ==========================================
// HEX KEY
// ==========================================

const OBF_KEY_BYTES = [];

for (let i = 0; i < MIRURO_PIPE_OBF_KEY.length; i += 2) {
    OBF_KEY_BYTES.push(
        parseInt(MIRURO_PIPE_OBF_KEY.slice(i, i + 2), 16)
    );
}

// ==========================================
// GLOBAL
// ==========================================

let GLOBAL;

try {
    GLOBAL = globalThis;
} catch (e) {
    GLOBAL = this;
}

// ==========================================
// FETCH COMPATIBILITY
// ==========================================

async function soraFetch(url, options = {}) {
    const method = options.method || "GET";
    const headers = options.headers || {};
    const body = options.body ?? null;

    console.log(`[HTTP] ${method} ${url}`);

    // Sora
    if (typeof fetchv2 !== "undefined") {
        try {
            const response = await fetchv2(
                url,
                headers,
                method,
                body
            );

            if (response) {
                console.log(
                    `[HTTP] fetchv2 status: ${response.status ?? "unknown"}`
                );
            }

            return response;
        } catch (e) {
            console.log(
                `[HTTP] fetchv2 failed: ${e.message}`
            );
        }
    }

    // Normal fetch fallback
    if (typeof fetch !== "undefined") {
        try {
            const response = await fetch(url, {
                method,
                headers,
                body
            });

            console.log(
                `[HTTP] fetch status: ${response.status}`
            );

            return response;
        } catch (e) {
            console.log(
                `[HTTP] fetch failed: ${e.message}`
            );
        }
    }

    throw new Error("No supported HTTP method available.");
}

// ==========================================
// BASE64
// ==========================================

function encodeBase64Url(text) {
    let binary;

    // UTF-8 → binary
    if (typeof TextEncoder !== "undefined") {
        const bytes = new TextEncoder().encode(text);

        binary = "";

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
    } else {
        binary = unescape(encodeURIComponent(text));
    }

    let encoded;

    if (typeof btoa !== "undefined") {
        encoded = btoa(binary);
    } else {
        encoded = pureBtoa(binary);
    }

    return encoded
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function pureBtoa(input) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    let output = "";

    for (
        let block = 0,
            charCode,
            i = 0,
            map = chars;

        input.charAt(i | 0) ||
        ((map = "="), i % 1);

        output += map.charAt(
            63 & (block >> (8 - (i % 1) * 8))
        )
    ) {
        charCode = input.charCodeAt(i += 3 / 4);

        block =
            (block << 8) |
            charCode;
    }

    return output;
}

function decodeBase64Url(input) {
    let value = String(input)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (value.length % 4 !== 0) {
        value += "=";
    }

    if (typeof atob !== "undefined") {
        return atob(value);
    }

    return pureAtob(value);
}

function pureAtob(input) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    let str = String(input).replace(/=+$/, "");

    if (str.length % 4 === 1) {
        return null;
    }

    let output = "";

    for (
        let bc = 0,
            bs = 0,
            buffer,
            i = 0;

        (buffer = str.charAt(i++));

        ~buffer &&
        (
            bs =
                bc % 4
                    ? bs * 64 + buffer
                    : buffer,
            bc++ % 4
        )
            ? output += String.fromCharCode(
                255 &
                (bs >> (-2 * bc & 6))
            )
            : 0
    ) {
        buffer = chars.indexOf(buffer);
    }

    return output;
}

// ==========================================
// PAKO
// ==========================================

async function ensurePako() {
    if (GLOBAL.pako) {
        console.log("[Pako] Already available.");
        return true;
    }

    console.log("[Pako] Loading...");

    const response = await soraFetch(
        "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js",
        {
            method: "GET"
        }
    );

    if (!response) {
        throw new Error("Unable to download pako.");
    }

    const code =
        typeof response.text === "function"
            ? await response.text()
            : response.data;

    if (!code) {
        throw new Error("Pako response was empty.");
    }

    console.log(
        `[Pako] Downloaded ${code.length} bytes.`
    );

    const runner =
        new Function(
            "window",
            "global",
            code
        );

    runner(GLOBAL, GLOBAL);

    if (!GLOBAL.pako) {
        throw new Error(
            "Pako downloaded but did not initialize."
        );
    }

    console.log("[Pako] Successfully initialized.");

    return true;
}

// ==========================================
// UTF-8
// ==========================================

function binaryToUtf8(binary) {
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    if (typeof TextDecoder !== "undefined") {
        try {
            return new TextDecoder("utf-8").decode(bytes);
        } catch (e) {}
    }

    let output = "";

    for (let i = 0; i < bytes.length; i++) {
        output += String.fromCharCode(bytes[i]);
    }

    try {
        return decodeURIComponent(
            escape(output)
        );
    } catch (e) {
        return output;
    }
}

// ==========================================
// MIRURO PIPE
// ==========================================

async function makeSecureRequest(
    path,
    query = {},
    referer = `${BASE_URL}/`
) {
    console.log("");
    console.log("==========================================");
    console.log(`[PIPE] Request: ${path}`);
    console.log("==========================================");

    await ensurePako();

    const payload = {
        path: path,
        method: "GET",
        query: query,
        body: null,
        version: "0.2.0"
    };

    const jsonPayload =
        JSON.stringify(payload);

    console.log(
        `[PIPE] Payload: ${jsonPayload}`
    );

    const encoded =
        encodeBase64Url(jsonPayload);

    const requestUrl =
        `${PIPE_URL}?e=${encoded}`;

    console.log(
        `[PIPE] URL: ${requestUrl}`
    );

    const headers = {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": BASE_URL,
        "Referer": referer
    };

    let response;

    try {
        response = await soraFetch(
            requestUrl,
            {
                method: "GET",
                headers
            }
        );
    } catch (e) {
        console.log(
            `[PIPE] Network error: ${e.message}`
        );

        throw e;
    }

    if (!response) {
        throw new Error(
            "Miruro returned no response."
        );
    }

    const status =
        response.status ?? "unknown";

    console.log(
        `[PIPE] HTTP status: ${status}`
    );

    let raw;

    try {
        raw =
            typeof response.text === "function"
                ? await response.text()
                : response.data;
    } catch (e) {
        throw new Error(
            `Unable to read response: ${e.message}`
        );
    }

    if (!raw) {
        throw new Error(
            "Miruro response body is empty."
        );
    }

    console.log(
        `[PIPE] Response length: ${raw.length}`
    );

    console.log(
        `[PIPE] Response preview: ${String(raw).slice(0, 200)}`
    );

    // ======================================
    // DIRECT JSON TEST
    // ======================================

    try {
        const direct =
            JSON.parse(raw);

        console.log(
            "[PIPE] Response is already JSON."
        );

        return direct;
    } catch (e) {
        // Not JSON — continue decoding.
    }

    // ======================================
    // HTML / CLOUDFLARE
    // ======================================

    const lower =
        String(raw).toLowerCase();

    if (
        String(raw).trim().startsWith("<html") ||
        String(raw).trim().startsWith("<!doctype") ||
        lower.includes("just a moment") ||
        lower.includes("cf-chl") ||
        lower.includes("cloudflare")
    ) {
        throw new Error(
            "Miruro returned an HTML/Cloudflare response."
        );
    }

    // ======================================
    // BASE64
    // ======================================

    let binary;

    try {
        binary =
            decodeBase64Url(raw.trim());
    } catch (e) {
        throw new Error(
            `Base64 decoding failed: ${e.message}`
        );
    }

    if (!binary) {
        throw new Error(
            "Base64 decoding produced empty data."
        );
    }

    console.log(
        `[PIPE] Base64 decoded: ${binary.length} bytes`
    );

    // ======================================
    // CREATE ORIGINAL BYTE ARRAY
    // ======================================

    const original =
        new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        original[i] =
            binary.charCodeAt(i);
    }

    // ======================================
    // ATTEMPT 1 — XOR
    // ======================================

    const xorBytes =
        new Uint8Array(original);

    for (
        let i = 0;
        i < xorBytes.length;
        i++
    ) {
        xorBytes[i] ^=
            OBF_KEY_BYTES[
                i % OBF_KEY_BYTES.length
            ];
    }

    console.log(
        "[PIPE] Trying XOR + gzip..."
    );

    try {
        const result =
            GLOBAL.pako.ungzip(
                xorBytes,
                { to: "string" }
            );

        console.log(
            "[PIPE] XOR + gzip succeeded."
        );

        return JSON.parse(result);
    } catch (e) {
        console.log(
            `[PIPE] XOR + gzip failed: ${e.message}`
        );
    }

    // ======================================
    // ATTEMPT 2 — XOR + DEFLATE
    // ======================================

    try {
        const result =
            GLOBAL.pako.inflate(
                xorBytes,
                { to: "string" }
            );

        console.log(
            "[PIPE] XOR + deflate succeeded."
        );

        return JSON.parse(result);
    } catch (e) {
        console.log(
            `[PIPE] XOR + deflate failed: ${e.message}`
        );
    }

    // ======================================
    // ATTEMPT 3 — RAW GZIP
    // ======================================

    console.log(
        "[PIPE] Trying raw gzip..."
    );

    try {
        const result =
            GLOBAL.pako.ungzip(
                original,
                { to: "string" }
            );

        console.log(
            "[PIPE] Raw gzip succeeded."
        );

        return JSON.parse(result);
    } catch (e) {
        console.log(
            `[PIPE] Raw gzip failed: ${e.message}`
        );
    }

    // ======================================
    // ATTEMPT 4 — RAW DEFLATE
    // ======================================

    try {
        const result =
            GLOBAL.pako.inflate(
                original,
                { to: "string" }
            );

        console.log(
            "[PIPE] Raw deflate succeeded."
        );

        return JSON.parse(result);
    } catch (e) {
        console.log(
            `[PIPE] Raw deflate failed: ${e.message}`
        );
    }

    // ======================================
    // FINAL TEXT ATTEMPT
    // ======================================

    const text =
        binaryToUtf8(binary);

    console.log(
        `[PIPE] Final text preview: ${text.slice(0, 500)}`
    );

    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(
            "Miruro response could not be decoded as JSON."
        );
    }
}

// ==========================================
// SEARCH
// ==========================================

async function searchResults(keyword) {
    console.log("");
    console.log("==========================================");
    console.log(`[SEARCH] ${keyword}`);
    console.log("==========================================");

    try {
        const data =
            await makeSecureRequest(
                "search",
                {
                    q: keyword,
                    limit: 5,
                    offset: 0,
                    sort: "POPULARITY_DESC",
                    type: "ANIME",
                    isAdult: false
                }
            );

        console.log(
            "[SEARCH] Successful response:"
        );

        console.log(data);

        let items = [];

        if (
            data &&
            Array.isArray(data.results)
        ) {
            items = data.results;
        } else if (
            Array.isArray(data)
        ) {
            items = data;
        }

        const results = [];

        for (const item of items) {
            if (!item) continue;

            if (item.isAdult === true) {
                continue;
            }

            if (
                Array.isArray(item.genres) &&
                item.genres.includes("Hentai")
            ) {
                continue;
            }

            const id = item.id;

            if (id == null) {
                continue;
            }

            const title =
                item.title?.romaji ||
                item.title?.english ||
                item.title?.native ||
                "Unknown";

            const image =
                item.coverImage?.large ||
                item.coverImage?.medium ||
                "";

            results.push({
                title,
                image,
                href: `miruro://${id}`
            });
        }

        console.log(
            `[SEARCH] Results: ${results.length}`
        );

        return JSON.stringify(results);

    } catch (e) {
        console.log(
            `[SEARCH] FAILED: ${e.message}`
        );

        console.log(e.stack || "");

        return JSON.stringify([]);
    }
}

// ==========================================
// TEMPORARY TEST
// ==========================================

async function testMiruro() {
    console.log("");
    console.log("##########################################");
    console.log("# MIRURO PIPE TEST");
    console.log("##########################################");

    try {
        const result =
            await searchResults("Naruto");

        console.log("");
        console.log("========== FINAL RESULT ==========");
        console.log(result);

        return result;

    } catch (e) {
        console.log(
            `[TEST] FAILED: ${e.message}`
        );

        return JSON.stringify({
            error: String(e)
        });
    }
}
