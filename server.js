import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ingredient database with toxicity scores (0-100, higher = more toxic)
const ingredientDatabase = {
  'sodium nitrite': { toxicity: 65, category: 'preservative', warnings: ['Possible carcinogen', 'May form carcinogenic nitrosamines'] },
  'high fructose corn syrup': { toxicity: 55, category: 'sweetener', warnings: ['Linked to obesity', 'Metabolic issues'] },
  'artificial sweetener': { toxicity: 45, category: 'sweetener', warnings: ['May affect gut bacteria'] },
  'sodium benzoate': { toxicity: 35, category: 'preservative', warnings: ['Generally recognized as safe'] },
  'titanium dioxide': { toxicity: 40, category: 'colorant', warnings: ['Potential nanoparticle concerns'] },
  'water': { toxicity: 0, category: 'solvent', warnings: [] },
  'salt': { toxicity: 15, category: 'seasoning', warnings: ['High sodium intake concerns'] },
  'sugar': { toxicity: 30, category: 'sweetener', warnings: ['Excess consumption linked to obesity'] },
  'wheat flour': { toxicity: 10, category: 'grain', warnings: ['Contains gluten'] },
  'eggs': { toxicity: 5, category: 'protein', warnings: [] },
  'milk': { toxicity: 5, category: 'dairy', warnings: ['Lactose content'] },
  'corn oil': { toxicity: 25, category: 'fat', warnings: ['High omega-6 to omega-3 ratio'] },
  'caramel coloring': { toxicity: 45, category: 'colorant', warnings: ['Contains ammonia compounds'] },
  'potassium sorbate': { toxicity: 20, category: 'preservative', warnings: ['Generally safe in small amounts'] },
  'citric acid': { toxicity: 10, category: 'preservative', warnings: ['Can erode tooth enamel in high concentrations'] },
};

// Product database with barcodes
const productDatabase = {
  '012000123456': { name: 'Classic Whole Milk', brand: 'Pure Dairy', ingredients: ['milk', 'vitamin d3'] },
  '016500123456': { name: 'Honey Cereal', brand: 'Golden Grain', ingredients: ['wheat flour', 'sugar', 'high fructose corn syrup', 'honey', 'salt', 'caramel coloring'] },
  '024600123456': { name: 'Creamy Peanut Butter', brand: 'Nutty Best', ingredients: ['peanuts', 'sugar', 'salt', 'corn oil'] },
  '011110123456': { name: 'Processed Meat', brand: 'Quick Lunch', ingredients: ['beef', 'sodium nitrite', 'salt', 'sodium benzoate'] },
  '049000123456': { name: 'Diet Soda', brand: 'Fizzy Light', ingredients: ['water', 'carbon dioxide', 'artificial sweetener', 'caramel coloring', 'citric acid'] },
  '028200123456': { name: 'Whole Wheat Bread', brand: 'Grain Good', ingredients: ['wheat flour', 'water', 'salt', 'yeast'] },
};

// Dietary filters
const dietaryFilters = {
  vegan: ['milk', 'eggs', 'beef', 'peanuts'],
  vegetarian: ['beef'],
  'gluten-free': ['wheat flour'],
  'dairy-free': ['milk'],
  'nut-free': ['peanuts'],
  paleo: ['wheat flour', 'sugar', 'high fructose corn syrup', 'artificial sweetener'],
};

// Mock FDA recalls
const mockRecalls = {
  '011110123456': { product: 'Processed Meat', reason: 'Listeria contamination', date: '2026-07-15' },
};

// API: Check ingredient safety
app.post('/api/check-ingredient', (req, res) => {
  const { ingredient } = req.body;

  if (!ingredient) {
    return res.status(400).json({ error: 'Ingredient name required' });
  }

  const normalized = ingredient.toLowerCase().trim();
  const info = ingredientDatabase[normalized];

  if (info) {
    return res.json({
      ingredient: ingredient,
      found: true,
      toxicity: info.toxicity,
      category: info.category,
      warnings: info.warnings,
      safetyScore: 100 - info.toxicity,
    });
  }

  // Unknown ingredient - return neutral score
  res.json({
    ingredient: ingredient,
    found: false,
    toxicity: null,
    category: 'unknown',
    warnings: ['Unknown ingredient - check third-party databases'],
    safetyScore: null,
  });
});

// API: Look up product by barcode
app.post('/api/lookup-barcode', (req, res) => {
  const { barcode } = req.body;

  if (!barcode) {
    return res.status(400).json({ error: 'Barcode required' });
  }

  const product = productDatabase[barcode];

  if (!product) {
    return res.status(404).json({ error: 'Product not found in database', barcode });
  }

  // Check for recalls
  const recall = mockRecalls[barcode];

  // Calculate ingredients with safety scores
  const ingredientsWithScores = product.ingredients.map(ing => {
    const info = ingredientDatabase[ing.toLowerCase()];
    return {
      name: ing,
      toxicity: info?.toxicity || null,
      safetyScore: info ? 100 - info.toxicity : null,
      warnings: info?.warnings || [],
    };
  });

  // Calculate overall safety score
  const validScores = ingredientsWithScores.filter(i => i.safetyScore !== null).map(i => i.safetyScore);
  const overallScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b) / validScores.length) : 50;

  res.json({
    barcode,
    product: product.name,
    brand: product.brand,
    ingredients: ingredientsWithScores,
    overallSafetyScore: overallScore,
    recall: recall || null,
  });
});

// API: Check dietary compatibility
app.post('/api/check-dietary', (req, res) => {
  const { ingredients, dietary } = req.body;

  if (!Array.isArray(ingredients) || !Array.isArray(dietary)) {
    return res.status(400).json({ error: 'ingredients and dietary arrays required' });
  }

  const incompatibilities = [];

  for (const filter of dietary) {
    const forbiddenList = dietaryFilters[filter.toLowerCase()];
    if (forbiddenList) {
      const found = ingredients.filter(ing => forbiddenList.includes(ing.toLowerCase()));
      if (found.length > 0) {
        incompatibilities.push({
          dietary: filter,
          incompatibleIngredients: found,
        });
      }
    }
  }

  res.json({
    compatible: incompatibilities.length === 0,
    incompatibilities,
  });
});

// API: Search products
app.get('/api/search-products', (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.json({ products: Object.entries(productDatabase).map(([barcode, info]) => ({
      barcode,
      ...info,
    })) });
  }

  const search = q.toLowerCase();
  const results = Object.entries(productDatabase)
    .filter(([, product]) =>
      product.name.toLowerCase().includes(search) ||
      product.brand.toLowerCase().includes(search)
    )
    .map(([barcode, info]) => ({ barcode, ...info }));

  res.json({ products: results });
});

app.listen(PORT, () => {
  console.log(`MilkNHoney server running at http://localhost:${PORT}`);
  console.log(`Try POST to http://localhost:${PORT}/api/lookup-barcode with {"barcode":"012000123456"}`);
});
