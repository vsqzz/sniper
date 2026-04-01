const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

let knownIds = new Set();
let liveItems = [];
let itemHistory = {};

async function fetchLimiteds() {
    try {
        const res = await axios.get('https://catalog.roblox.com/v1/search/items', {
            params: {
                category: 2,
                limit: 30,
                sortType: 3,
                sortAggregation: 5,
                includeNotForSale: true
            },
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const items = res.data?.data || [];

        for (const item of items) {
            let details = {};
            try {
                const det = await axios.get(
                    `https://economy.roblox.com/v1/assets/${item.id}/resale-data`
                );
                details = det.data;
            } catch {}

            let thumbUrl = '';
            try {
                const thumb = await axios.get(
                    `https://thumbnails.roblox.com/v1/assets?assetIds=${item.id}&size=150x150&format=Png`
                );
                thumbUrl = thumb.data?.data?.[0]?.imageUrl || '';
            } catch {}

            const prev = itemHistory[item.id] || {};

            const price = item.lowestPrice || item.price || 0;
            const rap = details.recentAveragePrice || 0;
            const stock = details.numberRemaining ?? 9999;
            const isOffsale = price === 0;

            // =========================
            // 🧠 SMART SCORING SYSTEM
            // =========================
            let score = 0;

            // 🔥 1. Transition detection (MOST IMPORTANT)
            if (!prev.offsale && isOffsale) score += 60;

            // 🔥 2. Already offsale but stable
            if (isOffsale) score += 20;

            // 🔥 3. Has RAP (means demand exists)
            if (rap > 0) score += 15;

            // 🔥 4. Low stock = rarity
            if (stock < 200) score += 10;
            if (stock < 100) score += 10;

            // 🔥 5. Creator weighting
            if (item.creatorName === "Roblox") score += 15;

            // 🔥 6. Stability check (not brand new garbage)
            if (prev.seenCount && prev.seenCount > 3) score += 10;

            // 🔥 7. Prevent spam items
            if (rap === 0 && !isOffsale) score -= 20;

            score = Math.max(0, Math.min(100, score));

            const entry = {
                id: item.id,
                name: item.name,
                price: price,
                rap: rap,
                stock: stock,
                imageUrl: thumbUrl,
                creator: item.creatorName || 'Roblox',
                score: score,
                offsale: isOffsale,
                badge: score >= 70 ? "potential" : "normal",
                timestamp: Date.now(),
            };

            // Save history
            itemHistory[item.id] = {
                offsale: isOffsale,
                seenCount: (prev.seenCount || 0) + 1
            };

            // Add new items
            if (!knownIds.has(item.id)) {
                knownIds.add(item.id);
                liveItems.unshift(entry);
            } else {
                // update existing item
                const index = liveItems.findIndex(i => i.id === item.id);
                if (index !== -1) {
                    liveItems[index] = entry;
                }
            }
        }

        if (liveItems.length > 100) {
            liveItems = liveItems.slice(0, 100);
        }

        console.log("Updated items with smart scoring");
    } catch (e) {
        console.error('Poll error:', e.message);
    }
}

fetchLimiteds();
setInterval(fetchLimiteds, 4000);

app.get('/limiteds', (req, res) => {
    res.json({ items: liveItems });
});

app.listen(PORT, () => console.log('Sniper proxy running on port', PORT));
