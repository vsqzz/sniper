// server.js — deploy this on Railway, Render, or any VPS
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

let knownIds = new Set();
let liveItems = []; // cached latest items

async function fetchLimiteds() {
    try {
        // Fetch recently added limiteds from catalog
        const res = await axios.get('https://catalog.roblox.com/v1/search/items', {
            params: {
                category: 'Collectibles',
                limit: 30,
                sortType: 3,         // newest first
                sortAggregation: 5,
                includeNotForSale: false,
            },
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const items = res.data?.data || [];
        const newOnes = [];

        for (const item of items) {
            if (!knownIds.has(item.id)) {
                knownIds.add(item.id);

                // Fetch extra details: RAP, value, stock
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

                const entry = {
                    id: item.id,
                    name: item.name,
                    price: item.lowestPrice || item.price || 0,
                    rap: details.recentAveragePrice || 0,
                    value: details.originalPrice || 0,
                    stock: details.numberRemaining ?? '?',
                    imageUrl: thumbUrl,
                    badge: 'new',
                    creator: item.creatorName || 'Roblox',
                    timestamp: Date.now(),
                };
                liveItems.unshift(entry);
                newOnes.push(entry);
            }
        }

        // Keep max 100 items
        if (liveItems.length > 100) liveItems = liveItems.slice(0, 100);
        console.log(`Polled: ${newOnes.length} new items`);
    } catch (e) {
        console.error('Poll error:', e.message);
    }
}

// Poll every 8 seconds
fetchLimiteds();
setInterval(fetchLimiteds, 8000);

// Endpoint for Roblox to call
app.get('/limiteds', (req, res) => {
    res.json({ items: liveItems });
});

app.listen(PORT, () => console.log('Sniper proxy running on port', PORT));
