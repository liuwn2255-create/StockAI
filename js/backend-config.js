// StockAI backend endpoint.
// After deploying the Cloudflare Worker, paste its HTTPS URL here.
// Keep ENABLE_LIVE_BACKEND false until the Worker is deployed and tested.
window.STOCKAI_CONFIG = {
  API_BASE_URL: 'https://stockai-worker.liuwn2255.workers.dev',
  ENABLE_LIVE_BACKEND: true,
};