/** Sora Module — Miruro
 * Search / Details / Episodes / Streams
 */

const BASE_URL = "https://www.miruro.to";
const PIPE_URL = "https://www.miruro.to/api/secure/pipe";
const MIRURO_PIPE_OBF_KEY = "71951034f8fbcf53d89db52ceb3dc22c";

// ============================================================
// GLOBAL
// ============================================================

let _global;

try {
    _global = globalThis;
} catch (e) {
    try {
        _global = window;
    } catch (e) {
        try {
            _global = global;
        } catch (e) {
            _global = this;
        }
    }
}

// ============================================================
// PIPE KEY
// ============================================================

const OBF_KEY_BYTES = [];

for (let i = 0; i < MIRURO_PIPE_OBF_KEY.length; i += 2) {
    OBF_KEY_BYTES.push(
        parseInt(MIRURO_PIPE_OBF_KEY.substr(i, 2), 16)
    );
}

// ============================================================
// BASE64
// ============================================================

function pureBtoa(input) {
    let str = String(input);
    let output = "";

    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    for (
        let block = 0,
        charCode,
        i = 0,
        map = chars;
        str.charAt(i | 0) || ((map = "="), i % 1);
        output += map.charAt(
            63 & (block >> (8 - (i % 1) * 8))
        )
    ) {
        charCode = str.charCodeAt(i += 3 / 4);

        block =
            (block << 8) |
            charCode;
    }

    return output;
}

function pureAtob(input) {
    let str = String(input).replace(/=+$/, "");

    if (str.length % 4 === 1) {
        return null;
    }

    let output = "";

    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    for (
        let bc = 0,
        bs = 0,
        buffer,
        i = 0;
        (buffer = str.charAt(i++));
        ~buffer &&
        (
            bs = bc % 4
                ? bs * 64 + buffer
                : buffer,
            bc++ % 4
        )
            ? output += String.fromCharCode(
                255 & (bs >> (-2 * bc & 6))
            )
            : 0
    ) {
        buffer = chars.indexOf(buffer);
    }

    return output;
}

function base64UrlEncode(obj) {
    const json = JSON.stringify(obj);
    const utf8 = unescape(encodeURIComponent(json));
    const b64 = pureBtoa(utf8);

    return b64
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function safeBytesToString(bytes) {
    let output = "";

    for (let i = 0; i < bytes.length; i++) {
        output += String.fromCharCode(bytes[i]);
    }

    try {
        return decodeURIComponent(escape(output));
    } catch (e) {
        return output;
    }
}

// ============================================================
// PAKO
// ============================================================

async function ensurePako() {
    if (_global.pako) {
        return true;
    }

    try {
        const response = await soraFetch(
            "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"
        );

        if (!response) {
            console.log("[Miruro] Pako request failed.");
            return false;
        }

        const code =
            typeof response.text === "function"
                ? await response.text()
                : response.data;

        if (!code) {
            console.log("[Miruro] Pako returned no code.");
            return false;
        }

        const runner = new Function(
            "window",
            "global",
            code
        );

        runner(_global, _global);

        return !!_global.pako;

    } catch (error) {
        console.log(
            "[Miruro] Pako error:",
            error.message
        );

        return false;
    }
}

// ============================================================
// SECURE PIPE
// ============================================================

async function makeSecureRequest(
    path,
    query = {},
    refererUrl = null
) {
    await ensurePako();

    const payload = {
        path: path,
        method: "GET",
        query: query,
        body: null,
        version: "0.2.0"
    };

    const encodedPayload =
        base64UrlEncode(payload);

    const url =
        `${PIPE_URL}?e=${encodedPayload}`;

    console.log(
        `[Pipe] Requesting: ${path}`
    );

    const headers = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146 Safari/537.36",

        "Accept": "*/*",

        "Accept-Language":
            "en-US,en;q=0.9",

        "Origin": BASE_URL,

        "Referer":
            refererUrl || `${BASE_URL}/`
    };

    let response;

    try {
        response = await soraFetch(
            url,
            {
                method: "GET",
                headers: headers
            }
        );
    } catch (error) {
        console.log(
            "[Pipe] Network error:",
            error.message
        );

        return null;
    }

    if (!response) {
        console.log(
            "[Pipe] No response."
        );

        return null;
    }

    let raw;

    try {
        if (typeof response.text === "function") {
            raw = await response.text();
        } else {
            raw = response.data;
        }
    } catch (error) {
        console.log(
            "[Pipe] Failed reading response:",
            error.message
        );

        return null;
    }

    if (!raw) {
        console.log(
            "[Pipe] Empty response."
        );

        return null;
    }

    console.log(
        `[Pipe] Raw response size: ${raw.length}`
    );

    // --------------------------------------------------------
    // CLOUDFLARE / HTML
    // --------------------------------------------------------

    const lowerRaw = String(raw).toLowerCase();

    if (
        String(raw).trim().startsWith("<") ||
        lowerRaw.includes("cloudflare") ||
        lowerRaw.includes("just a moment") ||
        lowerRaw.includes("upstream unreachable")
    ) {
        console.log(
            "[Pipe] Cloudflare / HTML response detected."
        );

        return {
            _blocked_by_cloudflare: true
        };
    }

    // --------------------------------------------------------
    // BASE64
    // --------------------------------------------------------

    let b64 = String(raw)
        .trim()
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padding = b64.length % 4;

    if (padding) {
        b64 += "=".repeat(4 - padding);
    }

    const binary = pureAtob(b64);

    if (!binary) {
        console.log(
            "[Pipe] Base64 decoding failed."
        );

        return null;
    }

    const originalBytes = [];

    for (let i = 0; i < binary.length; i++) {
        originalBytes.push(
            binary.charCodeAt(i)
        );
    }

    // --------------------------------------------------------
    // XOR
    // --------------------------------------------------------

    const xorBytes = originalBytes.slice();

    for (let i = 0; i < xorBytes.length; i++) {
        xorBytes[i] ^=
            OBF_KEY_BYTES[
                i % OBF_KEY_BYTES.length
            ];
    }

    let jsonString = null;

    // --------------------------------------------------------
    // TRY XOR + GZIP
    // --------------------------------------------------------

    if (_global.pako) {
        try {
            jsonString =
                _global.pako.ungzip(
                    xorBytes,
                    { to: "string" }
                );
        } catch (e) {
            try {
                jsonString =
                    _global.pako.inflate(
                        xorBytes,
                        { to: "string" }
                    );
            } catch (e2) {
                // Continue.
            }
        }
    }

    // --------------------------------------------------------
    // TRY WITHOUT XOR
    // --------------------------------------------------------

    if (!jsonString && _global.pako) {
        try {
            jsonString =
                _global.pako.ungzip(
                    originalBytes,
                    { to: "string" }
                );
        } catch (e) {
            try {
                jsonString =
                    _global.pako.inflate(
                        originalBytes,
                        { to: "string" }
                    );
            } catch (e2) {
                // Continue.
            }
        }
    }

    // --------------------------------------------------------
    // RAW FALLBACK
    // --------------------------------------------------------

    if (!jsonString) {
        jsonString =
            safeBytesToString(originalBytes);
    }

    if (!jsonString) {
        console.log(
            "[Pipe] Empty decoded string."
        );

        return null;
    }

    // --------------------------------------------------------
    // JSON
    // --------------------------------------------------------

    try {
        const parsed =
            JSON.parse(String(jsonString));

        console.log(
            `[Pipe] ${path} JSON parsed successfully.`
        );

        return parsed;

    } catch (error) {
        console.log(
            "[Pipe] JSON parse failed:",
            error.message
        );

        console.log(
            "[Pipe] Decoded preview:",
            String(jsonString).substring(0, 300)
        );

        return null;
    }
}

// ============================================================
// SEARCH
// ============================================================

async function searchResults(keyword) {
    console.log(
        `[Search] Searching for: ${keyword}`
    );

    try {
        const data =
            await makeSecureRequest(
                "search",
                {
                    q: keyword,
                    limit: 30,
                    offset: 0,
                    sort: "POPULARITY_DESC",
                    type: "ANIME",
                    isAdult: false
                }
            );

        console.log(
            "[Search] Response:",
            data
        );

        if (
            !data ||
            data._blocked_by_cloudflare
        ) {
            console.log(
                "[Search] No usable response."
            );

            return JSON.stringify([]);
        }

        // Support several possible response structures.
        let items = [];

        if (Array.isArray(data)) {
            items = data;
        } else if (
            Array.isArray(data.results)
        ) {
            items = data.results;
        } else if (
            Array.isArray(data.data?.results)
        ) {
            items = data.data.results;
        } else if (
            Array.isArray(data.data?.animes)
        ) {
            items = data.data.animes;
        } else if (
            Array.isArray(data.data)
        ) {
            items = data.data;
        }

        console.log(
            `[Search] Items found: ${items.length}`
        );

        const results = [];

        for (const item of items) {
            if (!item) {
                continue;
            }

            if (item.isAdult === true) {
                continue;
            }

            if (
                Array.isArray(item.genres) &&
                item.genres.some(
                    genre =>
                        String(genre).toLowerCase() ===
                        "hentai"
                )
            ) {
                continue;
            }

            const id =
                item.id ??
                item.anilistId ??
                item.anilist_id;

            if (id === undefined || id === null) {
                continue;
            }

            let title = "Unknown Title";

            if (typeof item.title === "string") {
                title = item.title;
            } else if (item.title) {
                title =
                    item.title.romaji ||
                    item.title.english ||
                    item.title.native ||
                    "Unknown Title";
            }

            const image =
                item.coverImage?.large ||
                item.coverImage?.medium ||
                item.poster ||
                item.image ||
                "";

            results.push({
                title: title,
                image: image,
                href: `miruro://${id}`
            });
        }

        console.log(
            `[Search] Returning ${results.length} results.`
        );

        return JSON.stringify(results);

    } catch (error) {
        console.log(
            "[Search] Error:",
            error.message
        );

        return JSON.stringify([]);
    }
}

// ============================================================
// DETAILS
// ============================================================

async function extractDetails(url) {
    console.log(
        `[Details] Loading: ${url}`
    );

    try {
        const id =
            String(url)
                .replace("miruro://", "")
                .trim();

        if (!id) {
            throw new Error(
                "Missing AniList ID"
            );
        }

        const data =
            await makeSecureRequest(
                `info/anilist/${id}`
            );

        if (
            !data ||
            data._blocked_by_cloudflare
        ) {
            return JSON.stringify([
                {
                    description:
                        "Network error.",
                    aliases: "",
                    airdate: ""
                }
            ]);
        }

        let description =
            "No description available.";

        let year = "Unknown";
        let rating = "N/A";

        if (data.description) {
            description =
                String(data.description)
                    .replace(/<[^>]*>/g, "")
                    .trim();
        }

        if (data.seasonYear) {
            year = data.seasonYear;
        }

        if (data.averageScore) {
            rating =
                `${data.averageScore}/100`;
        }

        return JSON.stringify([
            {
                description: description,
                aliases: `Score: ${rating}`,
                airdate: `Year: ${year}`
            }
        ]);

    } catch (error) {
        console.log(
            "[Details] Error:",
            error.message
        );

        return JSON.stringify([
            {
                description:
                    "Loading error.",
                aliases: "",
                airdate: ""
            }
        ]);
    }
}

// ============================================================
// EPISODES
// ============================================================

async function extractEpisodes(url) {
    console.log(
        `[Episodes] Loading: ${url}`
    );

    try {
        const anilistId =
            String(url)
                .replace("miruro://", "")
                .trim();

        if (!anilistId) {
            return JSON.stringify([]);
        }

        const data =
            await makeSecureRequest(
                "episodes",
                {
                    anilistId: anilistId
                }
            );

        if (
            !data ||
            data._blocked_by_cloudflare
        ) {
            return JSON.stringify([]);
        }

        const allEpisodes = [];

        function collectEpisodes(obj) {
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    if (
                        item &&
                        item.id !== undefined &&
                        item.number !== undefined
                    ) {
                        allEpisodes.push(item);
                    } else {
                        collectEpisodes(item);
                    }
                }

                return;
            }

            if (
                obj &&
                typeof obj === "object"
            ) {
                for (const value of Object.values(obj)) {
                    collectEpisodes(value);
                }
            }
        }

        collectEpisodes(data);

        const seen = new Set();
        const episodes = [];

        for (const ep of allEpisodes) {
            const number =
                Number(ep.number);

            if (
                !Number.isFinite(number) ||
                seen.has(number)
            ) {
                continue;
            }

            seen.add(number);

            episodes.push({
                href:
                    `miruro-play://${anilistId}/${number}`,
                number: number,
                season: 1,
                title:
                    ep.title ||
                    `Episode ${number}`
            });
        }

        episodes.sort(
            (a, b) =>
                a.number - b.number
        );

        console.log(
            `[Episodes] Found ${episodes.length} episodes.`
        );

        return JSON.stringify(episodes);

    } catch (error) {
        console.log(
            "[Episodes] Error:",
            error.message
        );

        return JSON.stringify([]);
    }
}

// ============================================================
// STREAM
// ============================================================

async function extractStreamUrl(url) {
    console.log(
        `[Player] Loading: ${url}`
    );

    try {
        const clean =
            String(url)
                .replace("miruro-play://", "");

        const parts =
            clean.split("/");

        const anilistId = parts[0];
        const epNumber = parts[1];

        if (!anilistId || !epNumber) {
            return null;
        }

        const watchReferer =
            `${BASE_URL}/watch/${anilistId}/${epNumber}?ep=${epNumber}`;

        const episodesData =
            await makeSecureRequest(
                "episodes",
                {
                    anilistId: anilistId
                }
            );

        if (
            !episodesData ||
            episodesData._blocked_by_cloudflare
        ) {
            return null;
        }

        const configs = [];

        function scanProviders(obj) {
            if (
                !obj ||
                typeof obj !== "object"
            ) {
                return;
            }

            if (
                obj.providers &&
                typeof obj.providers === "object"
            ) {
                for (
                    const [providerName, provider]
                    of Object.entries(obj.providers)
                ) {
                    if (
                        !provider ||
                        !provider.episodes
                    ) {
                        continue;
                    }

                    for (
                        const [category, list]
                        of Object.entries(
                            provider.episodes
                        )
                    ) {
                        if (!Array.isArray(list)) {
                            continue;
                        }

                        const episode =
                            list.find(
                                ep =>
                                    Number(ep.number) ===
                                    Number(epNumber)
                            );

                        if (
                            episode &&
                            episode.id
                        ) {
                            configs.push({
                                provider:
                                    String(providerName)
                                        .toLowerCase(),

                                category:
                                    String(category)
                                        .toLowerCase(),

                                episodeId:
                                    episode.id
                            });
                        }
                    }
                }
            }

            for (const value of Object.values(obj)) {
                if (
                    value &&
                    typeof value === "object"
                ) {
                    scanProviders(value);
                }
            }
        }

        scanProviders(episodesData);

        console.log(
            `[Player] Providers found: ${configs.length}`
        );

        const providersRequiringAniListId = [
            "dune",
            "zoro",
            "arc",
            "kiwi",
            "telli",
            "bee",
            "bun",
            "nun",
            "ally",
            "hop"
        ];

        for (const config of configs) {
            try {
                const query = {
                    episodeId:
                        config.episodeId,

                    provider:
                        config.provider,

                    category:
                        config.category,

                    ttl: 86400
                };

                if (
                    providersRequiringAniListId
                        .includes(config.provider)
                ) {
                    query.anilistId =
                        Number(anilistId);
                }

                const response =
                    await makeSecureRequest(
                        "sources",
                        query,
                        watchReferer
                    );

                if (
                    !response ||
                    response._blocked_by_cloudflare
                ) {
                    continue;
                }

                let sources =
                    response.sources ||
                    response.streams ||
                    [];

                if (
                    !Array.isArray(sources) ||
                    sources.length === 0
                ) {
                    const keys = [
                        config.category,
                        "sub",
                        "ssub",
                        "dub",
                        "hdub",
                        "hsub"
                    ];

                    for (const key of keys) {
                        const value =
                            response[key];

                        if (!value) {
                            continue;
                        }

                        if (
                            Array.isArray(
                                value.sources
                            )
                        ) {
                            sources =
                                value.sources;
                            break;
                        }

                        if (
                            Array.isArray(
                                value.streams
                            )
                        ) {
                            sources =
                                value.streams;
                            break;
                        }
                    }
                }

                if (
                    !Array.isArray(sources)
                ) {
                    continue;
                }

                for (const source of sources) {
                    if (!source?.url) {
                        continue;
                    }

                    const lower =
                        String(source.url)
                            .toLowerCase();

                    const isHLS =
                        lower.includes(".m3u8") ||
                        source.type === "hls";

                    if (!isHLS) {
                        continue;
                    }

                    let streamUrl =
                        source.url;

                    // Preserve your original Miruro
                    // compatibility replacement.
                    if (
                        streamUrl.includes(
                            "uwu.m3u8"
                        )
                    ) {
                        streamUrl =
                            streamUrl
                                .replace(
                                    "/stream/",
                                    "/hls/"
                                )
                                .replace(
                                    "uwu.m3u8",
                                    "owo.m3u8"
                                );
                    }

                    console.log(
                        "[Player] HLS found:",
                        streamUrl
                    );

                    return JSON.stringify({
                        type: "hls",
                        url: streamUrl,
                        headers: {
                            Referer:
                                source.referer ||
                                `${BASE_URL}/`
                        }
                    });
                }

            } catch (error) {
                console.log(
                    `[Player] ${config.provider} error:`,
                    error.message
                );
            }
        }

        console.log(
            "[Player] No playable HLS stream found."
        );

        return null;

    } catch (error) {
        console.log(
            "[Player] Error:",
            error.message
        );

        return null;
    }
}

// ============================================================
// SORA FETCH
// ============================================================

async function soraFetch(
    url,
    options = {
        headers: {},
        method: "GET",
        body: null
    }
) {
    try {
        if (
            typeof fetchv2 !== "undefined"
        ) {
            return await fetchv2(
                url,
                options.headers ?? {},
                options.method ?? "GET",
                options.body ?? null
            );
        }

        return await fetch(
            url,
            options
        );

    } catch (error) {
        console.log(
            "[soraFetch] Primary fetch failed:",
            error.message
        );

        try {
            return await fetch(
                url,
                options
            );
        } catch (fallbackError) {
            console.log(
                "[soraFetch] Fallback failed:",
                fallbackError.message
            );

            return null;
        }
    }
}