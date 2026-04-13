// ================================================================
// Database Seeder — Populates DB with demo data for first boot
// ================================================================
// Usage: node src/seed.js
// Creates: demo user, API key, sample domains, mock proxy pool

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scrapeforge';

async function seed() {
  console.log('=== ScrapeForge Database Seeder ===\n');

  await mongoose.connect(MONGO_URI, { maxPoolSize: 5 });
  console.log('✓ MongoDB connected\n');

  // ── 1. Demo User ──
  const User = require('./models/User');
  let user = await User.findOne({ email: 'demo@scrapeforge.io' });
  if (!user) {
    user = await User.create({
      email: 'demo@scrapeforge.io',
      passwordHash: 'DemoPass123!',  // Hashed by pre-save hook
      name: 'Demo User',
      role: 'admin',
      plan: 'enterprise',
      credits: 100000,
      isActive: true,
    });
    console.log('✓ Demo user created: demo@scrapeforge.io / DemoPass123!');
  } else {
    console.log('→ Demo user already exists');
  }

  // ── 2. API Key ──
  const ApiKey = require('./models/ApiKey');
  const existingKey = await ApiKey.findOne({ userId: user._id });
  if (!existingKey) {
    const keyPrefix = 'sf_demo_';
    const keyRandom = crypto.randomBytes(24).toString('hex');
    const key = `${keyPrefix}${keyRandom}`;
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    await ApiKey.create({
      key,
      keyPrefix,
      keyHash,
      userId: user._id,
      name: 'Demo API Key',
      permissions: ['scrape', 'crawl', 'search', 'extract', 'nlp', 'actors', 'datasets'],
      rateLimit: 1000,
      credits: 100000,
    });
    console.log(`✓ Demo API key created: ${key}`);
  } else {
    console.log('→ API key already exists');
  }

  // ── 3. Sample Domains (pre-populated intelligence) ──
  const Domain = require('./models/Domain');
  const domains = [
    { domain: 'example.com', difficultyScore: 1, antiBot: 'none', requiresJS: false, avgLatencyMs: 200, successRate: 0.99, bestStealthLevel: 0, bestProxyType: 'datacenter' },
    { domain: 'amazon.com', difficultyScore: 8, antiBot: 'cloudflare', requiresJS: true, avgLatencyMs: 1200, successRate: 0.72, bestStealthLevel: 4, bestProxyType: 'residential' },
    { domain: 'google.com', difficultyScore: 6, antiBot: 'custom', requiresJS: true, avgLatencyMs: 800, successRate: 0.85, bestStealthLevel: 3, bestProxyType: 'residential' },
    { domain: 'linkedin.com', difficultyScore: 9, antiBot: 'datadome', requiresJS: true, avgLatencyMs: 1500, successRate: 0.65, bestStealthLevel: 5, bestProxyType: 'residential' },
    { domain: 'twitter.com', difficultyScore: 7, antiBot: 'custom', requiresJS: true, avgLatencyMs: 900, successRate: 0.78, bestStealthLevel: 3, bestProxyType: 'datacenter' },
    { domain: 'wikipedia.org', difficultyScore: 1, antiBot: 'none', requiresJS: false, avgLatencyMs: 150, successRate: 0.99, bestStealthLevel: 0, bestProxyType: 'datacenter' },
    { domain: 'reddit.com', difficultyScore: 4, antiBot: 'none', requiresJS: true, avgLatencyMs: 600, successRate: 0.92, bestStealthLevel: 1, bestProxyType: 'datacenter' },
    { domain: 'yelp.com', difficultyScore: 7, antiBot: 'perimeterx', requiresJS: true, avgLatencyMs: 1100, successRate: 0.70, bestStealthLevel: 4, bestProxyType: 'residential' },
    { domain: 'zillow.com', difficultyScore: 8, antiBot: 'perimeterx', requiresJS: true, avgLatencyMs: 1300, successRate: 0.68, bestStealthLevel: 4, bestProxyType: 'residential' },
    { domain: 'imdb.com', difficultyScore: 3, antiBot: 'none', requiresJS: false, avgLatencyMs: 400, successRate: 0.95, bestStealthLevel: 1, bestProxyType: 'datacenter' },
    { domain: 'news.ycombinator.com', difficultyScore: 1, antiBot: 'none', requiresJS: false, avgLatencyMs: 100, successRate: 0.99, bestStealthLevel: 0, bestProxyType: 'datacenter' },
    { domain: 'github.com', difficultyScore: 3, antiBot: 'none', requiresJS: true, avgLatencyMs: 350, successRate: 0.96, bestStealthLevel: 1, bestProxyType: 'datacenter' },
  ];

  for (const d of domains) {
    await Domain.findOneAndUpdate({ domain: d.domain }, d, { upsert: true });
  }
  console.log(`✓ ${domains.length} sample domains seeded`);

  // ── 4. Mock Proxy Pool ──
  const Proxy = require('./models/Proxy');
  const existingProxies = await Proxy.countDocuments();
  if (existingProxies === 0) {
    const proxyDocs = [];
    const countries = ['US', 'US', 'US', 'GB', 'DE', 'FR', 'JP', 'CA', 'AU', 'BR', 'IN', 'SG', 'KR', 'NL'];
    const types = ['datacenter', 'datacenter', 'datacenter', 'residential', 'residential', 'mobile', 'isp'];

    for (let i = 0; i < 200; i++) {
      const type = types[i % types.length];
      const country = countries[i % countries.length];

      proxyDocs.push({
        ip: `${Math.floor(Math.random() * 200 + 20)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
        port: [3128, 8080, 8888, 8443, 1080][i % 5],
        type,
        protocol: 'http',
        provider: 'mock',
        country,
        status: Math.random() > 0.05 ? 'healthy' : 'degraded',
        latencyMs: Math.floor(Math.random() * 1000) + 50,
        successRate: 0.85 + Math.random() * 0.14,
        totalRequests: Math.floor(Math.random() * 10000),
        totalSuccesses: Math.floor(Math.random() * 9000) + 1000,
      });
    }

    await Proxy.insertMany(proxyDocs);
    console.log(`✓ ${proxyDocs.length} mock proxies seeded`);
  } else {
    console.log(`→ Proxy pool already has ${existingProxies} entries`);
  }

  // (No fake usage logs - data comes from real Request documents only)

  console.log('\n=== Seed Complete ===');
  console.log('Login: demo@scrapeforge.io / DemoPass123!');
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
