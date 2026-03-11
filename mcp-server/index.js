const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3001;
const OFF_BASE = 'https://world.openfoodfacts.org/api/v2';

/**
 * Normalize a product from Open Food Facts API into a clean shape.
 */
function normalizeProduct(raw) {
  if (!raw) return null;
  return {
    name: raw.product_name ?? null,
    barcode: raw.code ?? raw._id ?? null,
    brand: raw.brands ?? (Array.isArray(raw.brands_tags) ? raw.brands_tags[0]?.replace(/^[^:]+:/, '') : null) ?? null,
    category: raw.categories ?? (Array.isArray(raw.categories_tags) ? raw.categories_tags[0]?.replace(/^[^:]+:/, '') : null) ?? null,
    ingredients: raw.ingredients_text ?? null,
    nutritionGrade: raw.nutriscore_grade ?? raw.nutrition_grades ?? null,
    imageUrl: raw.image_url ?? raw.image_front_url ?? null,
  };
}

/**
 * Normalize search result products (list response uses different shape).
 */
function normalizeSearchProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.map((p) => normalizeProduct(p)).filter(Boolean);
}

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/search', async (req, res) => {
  try {
    const query = req.query.query ?? req.query.q ?? '';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || parseInt(req.query.page_size, 10) || 24));

    const { data } = await axios.get(`${OFF_BASE}/search`, {
      params: { q: query, page, page_size: pageSize },
      timeout: 15000,
    });

    const products = data.products ?? [];
    const total = data.count ?? products.length;

    res.json({
      query,
      page,
      pageSize,
      total,
      products: normalizeSearchProducts(products),
    });
  } catch (err) {
    console.error('Search error:', err.message);
    const status = err.response?.status ?? 502;
    res.status(status).json({
      error: 'Search failed',
      message: err.response?.data?.message ?? err.message,
    });
  }
});

app.get('/product/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    const { data } = await axios.get(`${OFF_BASE}/product/${encodeURIComponent(barcode)}`, {
      timeout: 15000,
    });

    if (data.status !== 1 || !data.product) {
      return res.status(404).json({
        error: 'Product not found',
        barcode,
      });
    }

    const raw = { ...data.product, code: data.code ?? data.product.code };
    res.json(normalizeProduct(raw));
  } catch (err) {
    console.error('Product fetch error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({
        error: 'Product not found',
        barcode: req.params.barcode,
      });
    }
    const status = err.response?.status ?? 502;
    res.status(status).json({
      error: 'Product fetch failed',
      message: err.response?.data?.message ?? err.message,
    });
  }
});

app.get('/category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || parseInt(req.query.page_size, 10) || 24));

    const { data } = await axios.get(`${OFF_BASE}/search`, {
      params: {
        categories_tags: category,
        page,
        page_size: pageSize,
      },
      timeout: 15000,
    });

    const products = data.products ?? [];
    const total = data.count ?? products.length;

    res.json({
      category,
      page,
      pageSize,
      total,
      products: normalizeSearchProducts(products),
    });
  } catch (err) {
    console.error('Category fetch error:', err.message);
    const status = err.response?.status ?? 502;
    res.status(status).json({
      error: 'Category fetch failed',
      message: err.response?.data?.message ?? err.message,
    });
  }
});

app.get('/brand/:brand', async (req, res) => {
  try {
    const brand = req.params.brand;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || parseInt(req.query.page_size, 10) || 24));

    const { data } = await axios.get(`${OFF_BASE}/search`, {
      params: {
        brands_tags: brand,
        page,
        page_size: pageSize,
      },
      timeout: 15000,
    });

    const products = data.products ?? [];
    const total = data.count ?? products.length;

    res.json({
      brand,
      page,
      pageSize,
      total,
      products: normalizeSearchProducts(products),
    });
  } catch (err) {
    console.error('Brand fetch error:', err.message);
    const status = err.response?.status ?? 502;
    res.status(status).json({
      error: 'Brand fetch failed',
      message: err.response?.data?.message ?? err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`MCP server listening on http://localhost:${PORT}`);
});
