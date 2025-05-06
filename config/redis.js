const redis = require('redis');
const client = redis.createClient({
    socket: {
        host: '127.0.0.1',
        port: 6379
    }
});

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    try {
        await client.connect();
        console.log('✅ Connected to Redis');
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
        process.exit(1);
    }
})();

module.exports = client;