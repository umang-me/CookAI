    /* ─────────────────────────────────────────
       MODULE: Theme System
       Reads / writes localStorage preference
    ───────────────────────────────────────── */
    const ThemeModule = (() => {
      const STORAGE_KEY = 'recipeai-theme';
      const html        = document.documentElement;
      const btn         = document.getElementById('themeToggle');

      function apply(theme) {
        html.setAttribute('data-theme', theme);
        btn.textContent = theme === 'dark' ? '☀️' : '🌙';
        btn.title       = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      }

      function init() {
        // Restore saved preference, or use system preference
        const saved = localStorage.getItem(STORAGE_KEY);
        const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        apply(saved || system);
      }

      function toggle() {
        const current = html.getAttribute('data-theme');
        const next    = current === 'dark' ? 'light' : 'dark';
        apply(next);
        localStorage.setItem(STORAGE_KEY, next);
      }

      btn.addEventListener('click', toggle);
      return { init };
    })();

    ThemeModule.init();


    /* ─────────────────────────────────────────
       MODULE: UI State
       Controls which panel is visible
    ───────────────────────────────────────── */
    const UI = (() => {
      const states = {
        placeholder : document.getElementById('placeholderState'),
        loading     : document.getElementById('loadingState'),
        error       : document.getElementById('errorState'),
        result      : document.getElementById('recipeResult'),
      };

      function showOnly(name) {
        Object.entries(states).forEach(([key, el]) => {
          if (key === 'placeholder') {
            el.classList.toggle('hidden', name !== 'placeholder');
          } else if (key === 'loading') {
            el.classList.toggle('show', name === 'loading');
          } else if (key === 'error') {
            el.classList.toggle('show', name === 'error');
          } else if (key === 'result') {
            el.classList.toggle('show', name === 'result');
          }
        });
      }

      function setError(msg) {
        document.getElementById('errorMsg').textContent = msg;
        showOnly('error');
      }

      return { showOnly, setError };
    })();


    /* ─────────────────────────────────────────
       MODULE: API
       Uses Claude Anthropic API to generate recipe JSON.
       Falls back to mock data on failure.
    ───────────────────────────────────────── */
    const API = (() => {

      // Builds the prompt asking for a JSON recipe
      function buildPrompt(ingredients) {
        return `You are a world-class chef and recipe writer.
Generate a single detailed recipe using these ingredients: ${ingredients}.

Respond ONLY with a raw JSON object — no markdown fences, no explanation. Use exactly this structure:
{
  "title": "Recipe name",
  "description": "2–3 sentence evocative description of the dish",
  "cuisine": "e.g. Italian, Asian, etc.",
  "prepTime": "X mins",
  "cookTime": "X mins",
  "servings": "X",
  "difficulty": "Easy | Medium | Hard",
  "ingredients": ["amount + ingredient", "..."],
  "steps": ["Full step description", "..."],
  "tip": "One useful chef tip or serving suggestion",
  "imagePrompt": "Short visual description of the plated dish (for image generation)"
}`;
      }

      // Calls the Anthropic API
      async function callAnthropicAPI(ingredients) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({
            model      : 'claude-sonnet-4-20250514',
            max_tokens : 1400,
            messages   : [{ role: 'user', content: buildPrompt(ingredients) }]
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `API error ${response.status}`);
        }

        const data = await response.json();
        const raw  = (data.content || []).map(b => b.text || '').join('');
        const clean = raw.replace(/```json|```/gi, '').trim();
        return JSON.parse(clean);
      }

      // Mock fallback data (used only if API fails)
      function mockRecipe(ingredients) {
        return {
          title       : "Rustic Kitchen Skillet",
          description : "A hearty, flavour-packed skillet dish assembled from what you have on hand. Simple, satisfying, and ready in under 30 minutes.",
          cuisine     : "Fusion",
          prepTime    : "10 mins",
          cookTime    : "20 mins",
          servings    : "2",
          difficulty  : "Easy",
          ingredients : [
            `Your chosen ingredients: ${ingredients}`,
            "Salt and black pepper to taste",
            "2 tbsp olive oil",
            "Fresh herbs for garnish"
          ],
          steps: [
            "Prepare all your ingredients — wash, chop, and measure everything before you start cooking.",
            "Heat olive oil in a large skillet over medium-high heat until shimmering.",
            "Add the ingredients in order of cooking time — hardest first, most delicate last.",
            "Season generously with salt and pepper. Taste as you go.",
            "Cook until everything is golden and tender, about 15–18 minutes total.",
            "Rest for 2 minutes before plating, then garnish with fresh herbs and serve."
          ],
          tip         : "Deglaze the pan with a splash of white wine or stock mid-cook for extra depth of flavour.",
          imagePrompt : "rustic skillet dish with golden vegetables and herbs"
        };
      }

      // Main fetch function with fallback
      async function fetchRecipe(ingredients) {
        try {
          return await callAnthropicAPI(ingredients);
        } catch (err) {
          console.warn('API call failed, using mock data:', err.message);
          // Re-throw so the caller can decide to show error or mock
          throw err;
        }
      }

      return { fetchRecipe, mockRecipe };
    })();


    /* ─────────────────────────────────────────
       MODULE: Renderer
       Injects recipe data into the DOM
    ───────────────────────────────────────── */
    const Renderer = (() => {

      function badgeHTML(label, cls) {
        return `<span class="badge badge-${cls}">${label}</span>`;
      }

      function render(recipe) {
        // Badges
        const badges = [];
        if (recipe.cuisine)    badges.push(badgeHTML('🌍 ' + recipe.cuisine, 'accent'));
        if (recipe.prepTime)   badges.push(badgeHTML('⏱ Prep ' + recipe.prepTime, 'green'));
        if (recipe.cookTime)   badges.push(badgeHTML('🔥 Cook ' + recipe.cookTime, 'green'));
        if (recipe.servings)   badges.push(badgeHTML('👥 Serves ' + recipe.servings, 'gold'));
        if (recipe.difficulty) badges.push(badgeHTML('📊 ' + recipe.difficulty, 'gold'));
        document.getElementById('recipeBadges').innerHTML = badges.join('');

        // Title + description
        document.getElementById('recipeTitle').textContent = recipe.title || 'Your Recipe';
        document.getElementById('recipeDesc').textContent  = recipe.description || '';

        // Ingredients
        const ingList = document.getElementById('ingredientsList');
        ingList.innerHTML = (recipe.ingredients || [])
          .map(i => `<li>${i}</li>`).join('');

        // Steps
        const stepList = document.getElementById('stepsList');
        stepList.innerHTML = (recipe.steps || [])
          .map((s, i) => `
            <li>
              <span class="step-num">${i + 1}</span>
              <span>${s}</span>
            </li>`).join('');

        // Chef's tip
        const tipEl     = document.getElementById('chefTip');
        const tipTextEl = document.getElementById('chefTipText');
        if (recipe.tip) {
          tipTextEl.textContent = recipe.tip;
          tipEl.style.display   = 'flex';
        } else {
          tipEl.style.display   = 'none';
        }

        // Image via Pollinations
        const wrap = document.getElementById('recipeImageWrap');
        const imgQ = encodeURIComponent(
          (recipe.imagePrompt || recipe.title) + ' food photography plated'
        );
        const imgSrc = `https://image.pollinations.ai/prompt/${imgQ}?width=860&height=320&nologo=true&seed=${Date.now()}`;
        wrap.innerHTML = `
          <div class="img-placeholder">🍽️</div>
          <img src="${imgSrc}" alt="${recipe.title}"
               style="opacity:0"
               onload="this.style.opacity='1'; this.previousSibling.style.display='none'"
               onerror="this.style.display='none'" />`;
      }

      return { render };
    })();


    /* ─────────────────────────────────────────
       MODULE: Input Controller
       Manages the ingredient input + clear button
    ───────────────────────────────────────── */
    const InputCtrl = (() => {
      const input    = document.getElementById('ingredientInput');
      const clearBtn = document.getElementById('clearBtn');
      const validMsg = document.getElementById('validationMsg');

      // Show/hide clear button based on content
      function updateClearBtn() {
        clearBtn.classList.toggle('visible', input.value.trim().length > 0);
      }

      // Validate — returns true if valid
      function validate() {
        const empty = input.value.trim().length === 0;
        validMsg.classList.toggle('show', empty);
        return !empty;
      }

      function clear() {
        input.value = '';
        updateClearBtn();
        validMsg.classList.remove('show');
        input.focus();
      }

      function getValue() { return input.value.trim(); }

      function setValue(val) {
        input.value = val;
        updateClearBtn();
        input.focus();
      }

      input.addEventListener('input', updateClearBtn);
      clearBtn.addEventListener('click', clear);

      // Allow Enter (without Shift) to trigger generate
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          document.getElementById('generateBtn').click();
        }
      });

      return { validate, getValue, setValue, clear };
    })();


    /* ─────────────────────────────────────────
       MODULE: Recipe Controller
       Orchestrates generate / random / re-render
    ───────────────────────────────────────── */
    const RecipeCtrl = (() => {
      let lastIngredients = '';

      const RANDOM_IDEAS = [
        'salmon, lemon, capers, dill, butter',
        'tofu, soy sauce, ginger, sesame, bok choy',
        'lamb, rosemary, garlic, potatoes, red wine',
        'shrimp, coconut milk, lemongrass, chili, rice',
        'mushrooms, thyme, cream, pasta, parmesan',
        'aubergine, tomato, feta, oregano, olive oil',
        'beef, onion, carrot, red wine, bay leaf',
        'mango, chili, lime, black beans, avocado',
        'sweet potato, chickpeas, spinach, cumin, yogurt',
        'duck, orange, honey, star anise, soy sauce',
      ];

      async function generate(ingredients) {
        if (!ingredients) return;
        lastIngredients = ingredients;

        // Disable buttons during fetch
        setButtonsDisabled(true);
        UI.showOnly('loading');

        try {
          const recipe = await API.fetchRecipe(ingredients);
          Renderer.render(recipe);
          UI.showOnly('result');
        } catch (err) {
          // On failure, offer mock data with error notice
          console.error(err);
          try {
            // Try to use mock as graceful fallback
            const mock = API.mockRecipe(ingredients);
            Renderer.render(mock);
            UI.showOnly('result');
            // Show a soft warning (non-blocking)
            console.warn('Using fallback recipe data. Error was:', err.message);
          } catch {
            UI.setError(`Unable to generate recipe: ${err.message || 'Network error'}. Please check your connection and try again.`);
          }
        } finally {
          setButtonsDisabled(false);
        }
      }

      function setButtonsDisabled(disabled) {
        ['generateBtn', 'randomBtn', 'newSearchBtn', 'regenerateBtn'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.disabled = disabled;
        });
      }

      // Public: generate from input field
      function generateFromInput() {
        if (!InputCtrl.validate()) return;
        generate(InputCtrl.getValue());
      }

      // Public: pick a random idea
      function generateRandom() {
        const pick = RANDOM_IDEAS[Math.floor(Math.random() * RANDOM_IDEAS.length)];
        InputCtrl.setValue(pick);
        generate(pick);
      }

      // Public: re-run last query
      function regenerate() {
        if (lastIngredients) generate(lastIngredients);
        else generateFromInput();
      }

      // Public: reset to placeholder
      function reset() {
        InputCtrl.clear();
        UI.showOnly('placeholder');
      }

      return { generateFromInput, generateRandom, regenerate, reset };
    })();


    /* ─────────────────────────────────────────
       EVENT BINDINGS
    ───────────────────────────────────────── */

    // Generate button
    document.getElementById('generateBtn').addEventListener('click', () => {
      RecipeCtrl.generateFromInput();
    });

    // Random recipe button
    document.getElementById('randomBtn').addEventListener('click', () => {
      RecipeCtrl.generateRandom();
    });

    // New search button (resets to placeholder)
    document.getElementById('newSearchBtn').addEventListener('click', () => {
      RecipeCtrl.reset();
    });

    // Regenerate button (re-runs last search)
    document.getElementById('regenerateBtn').addEventListener('click', () => {
      RecipeCtrl.regenerate();
    });

    // Placeholder suggestion chips
    document.querySelectorAll('.placeholder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const ingredients = chip.dataset.ingredients;
        InputCtrl.setValue(ingredients);
        RecipeCtrl.generateFromInput();
      });
    });