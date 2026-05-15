const CATS_KEY = 'cockpit_categories';
const MAP_KEY  = 'cockpit_project_cats';

export function getCategories() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATS_KEY)) ?? [];
    return raw.sort((a, b) => a.order - b.order);
  } catch (_) { return []; }
}

export function saveCategories(cats) {
  localStorage.setItem(CATS_KEY, JSON.stringify(cats));
}

export function getCatMap() {
  try { return JSON.parse(localStorage.getItem(MAP_KEY)) ?? {}; }
  catch (_) { return {}; }
}

export function assignProjectCat(projectId, catId) {
  const map = getCatMap();
  if (catId == null) delete map[projectId];
  else map[projectId] = catId;
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
}

export function createCategory(name) {
  const cats = getCategories();
  const cat = { id: crypto.randomUUID(), name: name.trim(), order: cats.length };
  cats.push(cat);
  saveCategories(cats);
  return cat;
}

export function deleteCategory(id) {
  const cats = getCategories().filter(c => c.id !== id);
  cats.forEach((c, i) => { c.order = i; });
  saveCategories(cats);
  // Désassigner les projets appartenant à cette catégorie
  const raw = localStorage.getItem(MAP_KEY);
  const map = raw ? JSON.parse(raw) : {};
  for (const pid of Object.keys(map)) {
    if (map[pid] === id) delete map[pid];
  }
  localStorage.setItem(MAP_KEY, JSON.stringify(map));
}

export function renameCategory(id, name) {
  const cats = getCategories();
  const cat = cats.find(c => c.id === id);
  if (cat && name.trim()) { cat.name = name.trim(); saveCategories(cats); }
}

export function moveCategory(fromIdx, toIdx) {
  const cats = getCategories();
  const [moved] = cats.splice(fromIdx, 1);
  cats.splice(toIdx, 0, moved);
  cats.forEach((c, i) => { c.order = i; });
  saveCategories(cats);
}
