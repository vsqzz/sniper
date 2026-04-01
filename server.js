const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

let knownIds = new Set();
let liveItems = [];
let itemHistory = {};

// 🔥 fallback data so your UI NEVER breaks
const fallbackItems = [
    {
        id: 1,
        name: "Test Limited",
        creatorName: "Roblox",
        lowPrice: 100,
    },
    {
        id: 2,
        name: "Example Item",
        creatorName: "Roblox",
        lowPrice: 50,
    }
];

async function fetchLimiteds() {
    try {
        const res = await axios.get('https://catalog.roblox.com/v1/search/items', {
            params: {
                category: 1,
                limit: 30,
                sortType: 1
            },
            timeout: 5000
        });

        let items = res.data?.data || [];

        // 🧠 if Roblox returns nothing → use fallback
        if (!items.length) {
            console.log("⚠️ No items from Roblox — using fallback");
            items = fallbackItems;
        }

        let updatedItems = [];

        for (const item of items) {
            let details = {};
            let thumbUrl = '';

            try {
                const det = await axios.get(
                    `https://economy.roblox.com/v1/assets/${item.id}/resale-data`,
                    { timeout: 3000 }
                );
                details = det.data || {};
            } catch {}

            try {
                const thumb = await axios.get(
                    `https://thumbnails.roblox.com/v1/assets?assetIds=${item.id}&size=150x150&format=Png`,
                    { timeout: 3000 }
                );
                thumbUrl = thumb.data?.data?.[0]?.imageUrl || '';
            } catch {}

            const prev = itemHistory[item.id] || {};

            const price = item.lowestPrice || item.price || item.lowPrice || 0;
            const rap = details.recentAveragePrice || 0;
            const stock = details.numberRemaining ?? 9999;
            const isOffsale = price === 0;

            // =========================
            // 🧠 SMART SCORING SYSTEM
            // =========================
            let score = 0;

            if (!prev.offsale && isOffsale) score += 60;
            if (isOffsale) score += 20;
            if (rap > 0) score += 15;
            if (stock < 200) score += 10;
            if (stock < 100) score += 10;
            if (item.creatorName === "Roblox") score += 15;
            if (prev.seenCount && prev.seenCount > 3) score += 10;
            if (rap === 0 && !isOffsale) score -= 20;

            score = Math.max(0, Math.min(100, score));

            const entry = {
                id: item.id,
                name: item.name || "Unknown",
                price: price || 0,
                rap: rap || 0,
                stock: stock || 0,
                imageUrl: thumbUrl || "",
                creator: item.creatorName || "Roblox",
                score: score || 0,
                offsale: isOffsale,
                badge: score >= 70 ? "potential" : "normal",
                timestamp: Date.now(),
                value: rap * 1.2
            };

            // history tracking
            itemHistory[item.id] = {
                offsale: isOffsale,
                seenCount: (prev.seenCount || 0) + 1
            };

            updatedItems.push(entry);

            // track known
            knownIds.add(item.id);
        }

        // merge instead of wiping
        liveItems = [...updatedItems, ...liveItems];

        // limit list size
        if (liveItems.length > 100) {
            liveItems = liveItems.slice(0, 100);
        }

        console.log("✅ Items updated:", liveItems.length);

    } catch (e) {
        console.error('❌ Poll error:', e.message);
    }
}

// start immediately + loop
fetchLimiteds();
setInterval(fetchLimiteds, 5000);

// API endpoint for your UI
app.get('/limiteds', (req, res) => {
    res.json({ items: liveItems });
});

app.listen(PORT, () => {
    console.log(`🚀 Sniper running on port ${PORT}`);
});
