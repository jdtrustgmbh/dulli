// Starter set: 20 classic kids' favourites with matching emojis. Merged once into the household recipe box
// (idempotent by id; recipes the family already has are never overwritten, deleted ones stay deleted).
(() => {
  const N = 'Nudeln', S = 'Suppen', M = 'Fleisch & Fisch', V = 'Vegetarisch', W = 'Süßes', F = 'Fingerfood';
  // [id, name, emojis, categories, servings, ingredients (one per line), preparation]
  const KIDS = [
    ['spaghetti-bolognese', 'Spaghetti Bolognese', ['🍝', '🍅'], [N, M], 4, '400 g Spaghetti\n400 g Hackfleisch\n1 Zwiebel\n1 Karotte\n500 g passierte Tomaten\n2 EL Tomatenmark\n1 EL Öl\nSalz\nParmesan', 'Zwiebel und Karotte fein würfeln, in Öl anbraten, Hackfleisch zugeben und krümelig braten. Tomatenmark und Tomaten einrühren, 20 Minuten köcheln lassen. Spaghetti kochen und mit der Sauce und Parmesan servieren.'],
    ['spaghetti-tomatensauce', 'Spaghetti mit Tomatensauce', ['🍝', '🍅'], [N, V], 4, '400 g Spaghetti\n500 g passierte Tomaten\n1 Zwiebel\n1 EL Öl\n1 TL Zucker\nSalz\nBasilikum\nParmesan', 'Zwiebel würfeln und in Öl glasig dünsten. Tomaten, Zucker und Salz zugeben, 15 Minuten köcheln. Spaghetti kochen, mit der Sauce mischen.'],
    ['mac-and-cheese', 'Käsemakkaroni (Mac and Cheese)', ['🧀', '🍝'], [N, V], 4, '350 g Makkaroni\n40 g Butter\n40 g Mehl\n500 ml Milch\n200 g geriebener Käse\nSalz\nMuskat', 'Makkaroni kochen. Butter schmelzen, Mehl einrühren, Milch nach und nach zugeben und aufkochen. Käse unterrühren, würzen, mit den Nudeln mischen.'],
    ['fischstaebchen-kartoffelpueree', 'Fischstäbchen mit Kartoffelpüree', ['🐟', '🥔'], [M], 4, '12 Fischstäbchen\n800 g Kartoffeln\n200 ml Milch\n30 g Butter\nSalz\nMuskat\n300 g Erbsen', 'Kartoffeln schälen, weich kochen, mit heißer Milch und Butter stampfen. Fischstäbchen laut Packung braten oder backen. Erbsen erhitzen und dazu servieren.'],
    ['chicken-nuggets-pommes', 'Chicken Nuggets mit Pommes', ['🍗', '🍟'], [M, F], 4, '500 g Hähnchenbrust\n2 Eier\n100 g Mehl\n150 g Semmelbrösel\n1 TL Paprikapulver\nSalz\n600 g Pommes (Ofen)\nKetchup', 'Hähnchen in Stücke schneiden, nacheinander in Mehl, Ei und gewürzten Bröseln wenden. Bei 200 °C etwa 15 Minuten backen, Pommes gleichzeitig im Ofen zubereiten.'],
    ['pizza-selbstgemacht', 'Pizza selbstgemacht', ['🍕'], [V, F], 4, '500 g Mehl\n1 Päckchen Trockenhefe\n300 ml lauwarmes Wasser\n2 EL Öl\n1 TL Salz\n300 ml Tomatensauce\n250 g Mozzarella\nBelag nach Wahl', 'Teig aus Mehl, Hefe, Wasser, Öl und Salz kneten, 45 Minuten gehen lassen. Ausrollen, mit Sauce, Käse und Belag bestreichen und bei 220 °C etwa 15 Minuten backen.'],
    ['waffeln', 'Waffeln', ['🧇', '🍓'], [W], 4, '250 g Mehl\n125 g weiche Butter\n100 g Zucker\n3 Eier\n1 TL Backpulver\n250 ml Milch\n1 Päckchen Vanillezucker\nObst oder Puderzucker', 'Alle Zutaten zu einem glatten Teig verrühren, 10 Minuten ruhen lassen. Im Waffeleisen goldbraun backen und mit Obst oder Puderzucker servieren.'],
    ['kartoffelsuppe-wuerstchen', 'Kartoffelsuppe mit Würstchen', ['🥣', '🌭'], [S], 4, '800 g Kartoffeln\n2 Karotten\n1 Zwiebel\n1 l Gemüsebrühe\n4 Wiener Würstchen\n1 EL Öl\nSalz\nPetersilie', 'Gemüse würfeln, in Öl anbraten, mit Brühe aufgießen und 20 Minuten weich kochen. Grob pürieren, Würstchenscheiben zugeben und kurz erwärmen.'],
    ['nudelsuppe', 'Hühnersuppe mit Nudeln', ['🍜', '🥕'], [S, M], 4, '1,5 l Hühnerbrühe\n2 Karotten\n200 g Hähnchenbrust\n150 g Suppennudeln\nSalz\nPetersilie', 'Brühe mit Karottenscheiben und Hähnchen 15 Minuten köcheln. Fleisch herausnehmen, zerzupfen, Nudeln in der Suppe garen und das Fleisch wieder zugeben.'],
    ['milchreis-zimt', 'Milchreis mit Zimt und Zucker', ['🍚', '🍎'], [W, V], 4, '250 g Milchreis\n1 l Milch\n3 EL Zucker\n1 Prise Salz\nZimt\nApfelmus oder Kirschen', 'Milch mit Zucker und Salz aufkochen, Reis einrühren und bei niedriger Hitze 30 Minuten quellen lassen, dabei öfter rühren. Mit Zimt-Zucker und Apfelmus servieren.'],
    ['ruehrei-toast', 'Rührei mit Toast', ['🍳', '🍞'], [V, F], 2, '6 Eier\n4 EL Milch\n1 EL Butter\nSalz\n4 Scheiben Toast\nSchnittlauch', 'Eier mit Milch und Salz verquirlen, in Butter bei mittlerer Hitze unter Rühren stocken lassen. Toast rösten und mit Schnittlauch servieren.'],
    ['kaese-schinken-toast', 'Käse-Schinken-Toast', ['🧀', '🍞'], [F], 4, '8 Scheiben Toast\n4 Scheiben Kochschinken\n8 Scheiben Käse\nButter', 'Toast mit Schinken und Käse belegen, zuklappen und im Ofen bei 200 °C oder in der Pfanne goldbraun überbacken.'],
    ['haehnchen-reis-pfanne', 'Hähnchen-Reis-Pfanne', ['🍗', '🍚'], [M], 4, '500 g Hähnchenbrust\n300 g Reis\n2 Paprika\n200 g Mais\n1 Zwiebel\n2 EL Öl\n250 ml Sahne\nSalz', 'Reis kochen. Hähnchen und Zwiebel in Öl anbraten, Paprika und Mais zugeben, mit Sahne ablöschen und würzen. Mit dem Reis servieren.'],
    ['hamburger', 'Hamburger', ['🍔', '🥬'], [M, F], 4, '500 g Hackfleisch\n4 Brötchen\n4 Scheiben Käse\n1 Tomate\nSalat\n1 Zwiebel\nKetchup\nSalz', 'Hackfleisch würzen, zu 4 Patties formen und beidseitig braten. Brötchen toasten, mit Salat, Tomate, Patty, Käse und Ketchup belegen.'],
    ['wraps-haehnchen', 'Wraps mit Hähnchen und Gemüse', ['🌯', '🥒'], [M, F], 4, '4 Tortillas\n300 g Hähnchenbrust\n1 Gurke\n2 Tomaten\nSalat\n100 g Frischkäse\nSalz', 'Hähnchen in Streifen braten. Tortillas mit Frischkäse bestreichen, mit Hähnchen und Gemüse füllen und einrollen.'],
    ['kartoffelpuffer-apfelmus', 'Kartoffelpuffer mit Apfelmus', ['🥔', '🍎'], [V], 4, '1 kg Kartoffeln\n1 Zwiebel\n2 Eier\n3 EL Mehl\nSalz\nÖl zum Braten\nApfelmus', 'Kartoffeln und Zwiebel reiben, ausdrücken, mit Eiern, Mehl und Salz mischen. Kleine Fladen in heißem Öl goldbraun ausbacken, mit Apfelmus servieren.'],
    ['currywurst-pommes', 'Currywurst mit Pommes', ['🌭', '🍟'], [M, F], 4, '4 Bratwürste\n600 g Pommes (Ofen)\n200 ml Ketchup\n1 EL Currypulver\n1 TL Paprikapulver\n1 EL Öl', 'Pommes im Ofen backen. Würste braten und in Scheiben schneiden. Ketchup mit Curry und Paprika erwärmen und über die Würste geben.'],
    ['schnitzel-kartoffeln', 'Schnitzel mit Kartoffeln und Gurkensalat', ['🍖', '🥔', '🥒'], [M], 4, '4 Schweine- oder Putenschnitzel\n2 Eier\n100 g Mehl\n150 g Semmelbrösel\nÖl\n800 g Kartoffeln\n1 Gurke\nSalz', 'Schnitzel flach klopfen, in Mehl, Ei und Bröseln wenden und in Öl goldbraun braten. Kartoffeln kochen, Gurke hobeln und mit Salz und Essig anmachen.'],
    ['kaiserschmarrn', 'Kaiserschmarrn', ['🥞', '🍎'], [W, V], 4, '250 g Mehl\n4 Eier\n400 ml Milch\n3 EL Zucker\n1 Prise Salz\n2 EL Butter\nRosinen\nPuderzucker\nApfelmus', 'Teig aus Mehl, Eigelb, Milch und Zucker rühren, Eischnee unterheben. In Butter ausbacken, wenden, mit zwei Gabeln zerreißen und mit Puderzucker und Apfelmus servieren.'],
    ['nudelauflauf-schinken', 'Nudelauflauf mit Schinken', ['🍝', '🧀'], [N, M], 4, '400 g Penne\n200 g gekochter Schinken\n200 g Sahne\n150 g Frischkäse\n200 g geriebener Käse\n1 Zwiebel\nSalz', 'Nudeln kochen. Zwiebel und Schinken würfeln, mit Sahne und Frischkäse verrühren, würzen. Mit den Nudeln in eine Form geben, mit Käse bestreuen und bei 200 °C 20 Minuten überbacken.']
  ];
  const recipeOf = ([slug, name, emojis, categories, servings, ingredients, prep]) => ({ id: `kids-${slug}`, name, emojis, photo: null, servings, ingredients, prep, categories });

  // One-time polish of the household's hand-made Pfannkuchen recipe (keeps its photo and servings).
  const polishPancakes = value => {
    if (value.pancakesStyled) {
      // Follow-up: first version used 🍓; the family wants the Apfelmus variant.
      if (value.pancakeEmojiV2) return false;
      value.pancakeEmojiV2 = 1;
      const styled = (value.items ?? []).find(entry => /^pfannkuchen$/i.test(String(entry.name ?? '').trim()) && (entry.emojis ?? []).join('') === '🥞🍓');
      if (styled) styled.emojis = ['🥞', '🍎'];
      return true;
    }
    const item = (value.items ?? []).find(entry => /^pfannkuchen$/i.test(String(entry.name ?? '').trim()) && !String(entry.prep ?? '').trim());
    value.pancakesStyled = 1; value.pancakeEmojiV2 = 1;
    if (!item) return true;
    Object.assign(item, {
      emojis: ['🥞', '🍎'], categories: [W, V], servings: item.servings || 5,
      ingredients: '250 g Mehl\n4 Eier\n500 ml Milch\n1 EL Zucker\n1 Prise Salz\n2 EL Butter\nApfelmus, Obst oder Zucker',
      prep: 'Mehl, Eier, Milch, Zucker und Salz zu einem glatten Teig verrühren und 10 Minuten quellen lassen. Butter in einer Pfanne erhitzen, eine kleine Kelle Teig hineingeben und von beiden Seiten goldbraun backen. Mit Apfelmus, Obst oder Zucker servieren.'
    });
    return true;
  };

  const seed = () => {
    const extras = window.jdExtras; if (!extras) return;
    const value = extras.get('recipes', null) ?? { categories: [], items: [] };
    if (value.kidsSeeded) { const next = { ...value, items: (value.items ?? []).map(item => ({ ...item })) }; if (polishPancakes(next)) extras.set('recipes', next); return; }
    const items = [...(value.items ?? [])];
    const names = new Set(items.map(item => String(item.name ?? '').trim().toLowerCase()));
    for (const row of KIDS) { const recipe = recipeOf(row); if (!items.some(item => item.id === recipe.id) && !names.has(recipe.name.toLowerCase())) items.push(recipe); }
    // The household's own emoji-less recipes get a matching emoji so tiles are never blank.
    for (const item of items) if (!(item.emojis ?? []).length && /pfannkuchen|eierkuchen/i.test(item.name)) item.emojis = ['🥞'];
    const categories = [...new Set([...(value.categories ?? []), N, S, M, V, W, F])];
    const next = { ...value, categories, items, kidsSeeded: 1 }; polishPancakes(next); extras.set('recipes', next);
  };
  (window.jdExtras?.ready?.() ?? Promise.resolve()).then(seed);
})();
