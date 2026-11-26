module.exports = {
  ci: {
    collect: {
      url: [
        'https://dt.gkv906128.workers.dev/index.php',
        'https://dt.gkv906128.workers.dev/shop.php',
        'https://dt.gkv906128.workers.dev/product.php?id=1',
      ],
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.6 }],
        'categories:accessibility': ['warn', { minScore: 0.7 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
