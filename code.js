// Screenshot to Design - Figma Plugin
// code.js runs in Figma sandbox

figma.showUI(__html__, { width: 520, height: 720, themeColors: true });

// ==================== UTILITIES ====================
function hexToRgb(hex) {
  if (!hex || hex.length < 7) return null;
  var r = parseInt(hex.substring(1, 3), 16) / 255;
  var g = parseInt(hex.substring(3, 5), 16) / 255;
  var b = parseInt(hex.substring(5, 7), 16) / 255;
  return { r: r, g: g, b: b };
}

async function loadFont(node) {
  try {
    if (node.fontName === figma.mixed) {
      var segs = node.getStyledTextSegments(["fontName"]);
      if (segs.length > 0) await figma.loadFontAsync(segs[0].fontName);
    } else {
      await figma.loadFontAsync(node.fontName);
    }
  } catch (e) {
    try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e2) {}
  }
}

function findTextNode(n) {
  if (n.type === "TEXT") return n;
  if ("children" in n) {
    for (var i = 0; i < n.children.length; i++) {
      var found = findTextNode(n.children[i]);
      if (found) return found;
    }
  }
  return null;
}

async function setText(node, text) {
  var tn = findTextNode(node);
  if (tn) { await loadFont(tn); tn.characters = text; }
}

// ==================== CONFIG PERSISTENCE ====================
async function loadConfig() {
  try {
    var cfg = await figma.clientStorage.getAsync("s2d_config");
    return cfg || null;
  } catch (e) { return null; }
}

async function saveConfig(cfg) {
  try { await figma.clientStorage.setAsync("s2d_config", cfg); } catch (e) {}
}

// ==================== SCAN DESIGN SYSTEM ====================
function scanDesignSystem() {
  var components = [];
  var componentSets = [];
  var paintStyles = [];
  var textStyles = [];

  // Paint styles
  var localPaints = figma.getLocalPaintStyles();
  for (var i = 0; i < localPaints.length; i++) {
    var ps = localPaints[i];
    var hex = "";
    if (ps.paints && ps.paints.length > 0 && ps.paints[0].type === "SOLID") {
      var c = ps.paints[0].color;
      hex = "#" + Math.round(c.r * 255).toString(16).padStart(2, "0") +
            Math.round(c.g * 255).toString(16).padStart(2, "0") +
            Math.round(c.b * 255).toString(16).padStart(2, "0");
    }
    paintStyles.push({ id: ps.id, name: ps.name, hex: hex.toUpperCase() });
  }

  // Text styles
  var localTexts = figma.getLocalTextStyles();
  for (var j = 0; j < localTexts.length; j++) {
    var ts = localTexts[j];
    textStyles.push({ id: ts.id, name: ts.name, fontSize: ts.fontSize, fontFamily: ts.fontName ? ts.fontName.family : "" });
  }

  // Scan nodes
  function scanNode(node, pageName) {
    if (node.type === "COMPONENT") {
      var fills = [];
      if ("fills" in node && Array.isArray(node.fills)) {
        for (var fi = 0; fi < node.fills.length; fi++) {
          var f = node.fills[fi];
          if (f.type === "SOLID" && f.visible !== false) {
            var fc = f.color;
            fills.push("#" + Math.round(fc.r * 255).toString(16).padStart(2, "0") +
                        Math.round(fc.g * 255).toString(16).padStart(2, "0") +
                        Math.round(fc.b * 255).toString(16).padStart(2, "0"));
          }
        }
      }
      var cr = ("cornerRadius" in node && node.cornerRadius !== figma.mixed) ? node.cornerRadius : null;
      var variants = {};
      if (node.parent && node.parent.type === "COMPONENT_SET") {
        var parts = node.name.split(",");
        for (var np = 0; np < parts.length; np++) {
          var eq = parts[np].indexOf("=");
          if (eq >= 0) variants[parts[np].substring(0, eq).trim()] = parts[np].substring(eq + 1).trim();
        }
      }
      components.push({
        id: node.id, name: node.name, pageName: pageName,
        width: Math.round(node.width), height: Math.round(node.height),
        fills: fills, cornerRadius: cr, variants: variants,
        parentId: node.parent && node.parent.type === "COMPONENT_SET" ? node.parent.id : null,
        parentName: node.parent && node.parent.type === "COMPONENT_SET" ? node.parent.name : null,
      });
    }
    if ("children" in node) {
      for (var ci = 0; ci < node.children.length; ci++) {
        scanNode(node.children[ci], pageName);
      }
    }
  }

  // Component sets
  for (var pi = 0; pi < figma.root.children.length; pi++) {
    var page = figma.root.children[pi];
    for (var ni = 0; ni < page.children.length; ni++) {
      if (page.children[ni].type === "COMPONENT_SET") {
        var cs = page.children[ni];
        var props = {};
        for (var pk in cs.componentPropertyDefinitions) {
          if (cs.componentPropertyDefinitions[pk].variantOptions) {
            props[pk] = cs.componentPropertyDefinitions[pk].variantOptions;
          }
        }
        componentSets.push({ id: cs.id, name: cs.name, pageName: page.name, variantProperties: props, childCount: cs.children.length });
      }
    }
    scanNode(page, page.name);
  }

  return { components: components, componentSets: componentSets, paintStyles: paintStyles, textStyles: textStyles };
}

// ==================== DEFAULT LOGIN PAGE ====================
async function generateDefaultLoginPage() {
  var page = figma.createPage();
  page.name = "Test - Login Page";

  var root = figma.createFrame();
  root.name = "Login Page";
  root.resize(375, 812);
  root.layoutMode = "VERTICAL";
  root.primaryAxisAlignItems = "CENTER";
  root.counterAxisAlignItems = "CENTER";
  root.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.99 } }];
  root.clipsContent = true;
  page.appendChild(root);

  // Container
  var container = figma.createFrame();
  container.name = "Container";
  container.layoutMode = "VERTICAL";
  container.itemSpacing = 32;
  container.paddingTop = 0;
  container.paddingBottom = 0;
  container.paddingLeft = 32;
  container.paddingRight = 32;
  container.resize(375 - 64, root.height);
  root.appendChild(container);

  // Logo area
  var logo = figma.createFrame();
  logo.name = "Logo";
  logo.layoutMode = "HORIZONTAL";
  logo.primaryAxisAlignItems = "CENTER";
  logo.counterAxisAlignItems = "CENTER";
  logo.resize(80, 80);
  logo.cornerRadius = 20;
  logo.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.25, b: 0.57 } }];
  var logoText = figma.createText();
  await loadFont(logoText);
  logoText.characters = "App";
  logoText.fontSize = 20;
  logoText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  logoText.fontWeight = 700;
  logo.appendChild(logoText);
  container.appendChild(logo);

  // Title section
  var titleSection = figma.createFrame();
  titleSection.name = "Title Section";
  titleSection.layoutMode = "VERTICAL";
  titleSection.itemSpacing = 8;
  titleSection.resize(375 - 64, figma.mixed);
  container.appendChild(titleSection);

  var h1 = figma.createText();
  await loadFont(h1);
  h1.characters = "Welcome Back";
  h1.fontSize = 28;
  h1.fontWeight = 700;
  titleSection.appendChild(h1);

  var subtitle = figma.createText();
  await loadFont(subtitle);
  subtitle.characters = "Sign in to your account";
  subtitle.fontSize = 14;
  subtitle.fills = [{ type: "SOLID", color: { r: 0.45, g: 0.45, b: 0.5 } }];
  titleSection.appendChild(subtitle);

  // Form section
  var form = figma.createFrame();
  form.name = "Form";
  form.layoutMode = "VERTICAL";
  form.itemSpacing = 16;
  form.resize(375 - 64, figma.mixed);
  container.appendChild(form);

  // Email input
  var emailLabel = figma.createText();
  await loadFont(emailLabel);
  emailLabel.characters = "Email";
  emailLabel.fontSize = 12;
  emailLabel.fontWeight = 600;
  form.appendChild(emailLabel);
  var emailInput = figma.createFrame();
  emailInput.name = "Email Input";
  emailInput.layoutMode = "HORIZONTAL";
  emailInput.primaryAxisAlignItems = "CENTER";
  emailInput.paddingLeft = 14;
  emailInput.paddingRight = 14;
  emailInput.resize(375 - 64, 48);
  emailInput.cornerRadius = 10;
  emailInput.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  emailInput.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.88, b: 0.9 } }];
  emailInput.strokeWeight = 1;
  var emailPlaceholder = figma.createText();
  await loadFont(emailPlaceholder);
  emailPlaceholder.characters = "you@example.com";
  emailPlaceholder.fontSize = 14;
  emailPlaceholder.fills = [{ type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.73 } }];
  emailInput.appendChild(emailPlaceholder);
  form.appendChild(emailInput);

  // Password input
  var passLabel = figma.createText();
  await loadFont(passLabel);
  passLabel.characters = "Password";
  passLabel.fontSize = 12;
  passLabel.fontWeight = 600;
  form.appendChild(passLabel);
  var passInput = figma.createFrame();
  passInput.name = "Password Input";
  passInput.layoutMode = "HORIZONTAL";
  passInput.primaryAxisAlignItems = "CENTER";
  passInput.paddingLeft = 14;
  passInput.paddingRight = 14;
  passInput.resize(375 - 64, 48);
  passInput.cornerRadius = 10;
  passInput.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  passInput.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.88, b: 0.9 } }];
  passInput.strokeWeight = 1;
  var passPlaceholder = figma.createText();
  await loadFont(passPlaceholder);
  passPlaceholder.characters = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  passPlaceholder.fontSize = 14;
  passPlaceholder.fills = [{ type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.73 } }];
  passInput.appendChild(passPlaceholder);
  form.appendChild(passInput);

  // Login button
  var btn = figma.createFrame();
  btn.name = "Login Button";
  btn.layoutMode = "HORIZONTAL";
  btn.primaryAxisAlignItems = "CENTER";
  btn.counterAxisAlignItems = "CENTER";
  btn.resize(375 - 64, 48);
  btn.cornerRadius = 10;
  btn.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.25, b: 0.57 } }];
  var btnText = figma.createText();
  await loadFont(btnText);
  btnText.characters = "Log In";
  btnText.fontSize = 15;
  btnText.fontWeight = 600;
  btnText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  btn.appendChild(btnText);
  form.appendChild(btn);

  // Forgot password
  var forgotLink = figma.createText();
  await loadFont(forgotLink);
  forgotLink.characters = "Forgot password?";
  forgotLink.fontSize = 13;
  forgotLink.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.25, b: 0.57 } }];
  forgotLink.textAlignHorizontal = "CENTER";
  forgotLink.resize(375 - 64, figma.mixed);
  form.appendChild(forgotLink);

  // Spacer
  var spacer = figma.createFrame();
  spacer.resize(1, 40);
  spacer.fills = [];
  container.appendChild(spacer);

  // Sign up
  var signUp = figma.createFrame();
  signUp.name = "Sign Up";
  signUp.layoutMode = "HORIZONTAL";
  signUp.itemSpacing = 4;
  signUp.primaryAxisAlignItems = "CENTER";
  signUp.counterAxisAlignItems = "CENTER";
  container.appendChild(signUp);

  var noAccount = figma.createText();
  await loadFont(noAccount);
  noAccount.characters = "Don't have an account? ";
  noAccount.fontSize = 13;
  noAccount.fills = [{ type: "SOLID", color: { r: 0.45, g: 0.45, b: 0.5 } }];
  signUp.appendChild(noAccount);

  var signUpLink = figma.createText();
  await loadFont(signUpLink);
  signUpLink.characters = "Sign Up";
  signUpLink.fontSize = 13;
  signUpLink.fontWeight = 600;
  signUpLink.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.25, b: 0.57 } }];
  signUp.appendChild(signUpLink);

  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView([root]);
  return { success: true, pageName: page.name };
}

// ==================== GENERATE PAGE FROM AI ====================
async function generatePage(elements) {
  var page = figma.createPage();
  page.name = "Generated - " + new Date().toLocaleDateString();

  var layout = elements.layout || {};
  var root = figma.createFrame();
  root.name = "Generated Layout";
  root.layoutMode = layout.direction === "horizontal" ? "HORIZONTAL" : "VERTICAL";
  root.itemSpacing = layout.gap || 16;
  var pad = layout.padding || 24;
  root.paddingLeft = pad;
  root.paddingRight = pad;
  root.paddingTop = pad;
  root.paddingBottom = pad;
  root.primaryAxisAlignItems = "CENTER";
  root.counterAxisAlignItems = "CENTER";
  root.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  page.appendChild(root);

  for (var i = 0; i < elements.items.length; i++) {
    var item = elements.items[i];
    var node = null;

    if (item.matchType === "component" && item.componentId) {
      try {
        var compNode = figma.getNodeById(item.componentId);
        if (compNode) {
          node = compNode.createInstance();
          if (item.text) await setText(node, item.text);
          if (item.variantOverrides) {
            for (var vk in item.variantOverrides) {
              try { node.setProperties({ [vk]: item.variantOverrides[vk] }); } catch (e) {}
            }
          }
        }
      } catch (e) { node = await createFallback(item); }
    } else if (item.matchType === "componentSet" && item.componentSetId) {
      try {
        var csNode = figma.getNodeById(item.componentSetId);
        if (csNode && csNode.type === "COMPONENT_SET") {
          var matchComp = findMatchingVariant(csNode, item.variantOverrides || {});
          if (matchComp) {
            node = matchComp.createInstance();
            if (item.text) await setText(node, item.text);
          }
        }
      } catch (e) { node = await createFallback(item); }
    } else {
      node = await createFallback(item);
    }

    if (node) {
      if (item.width && item.width > 0) {
        var rw = item.width;
        var rh = (item.height && item.height > 0) ? item.height : node.height;
        try { node.resize(rw, rh); } catch (e) {}
      }
      root.appendChild(node);
    }
  }

  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView([root]);
  return { success: true, pageCount: elements.items.length, pageName: page.name };
}

function findMatchingVariant(cs, overrides) {
  for (var i = 0; i < cs.children.length; i++) {
    var child = cs.children[i];
    var ok = true;
    for (var vk in overrides) {
      if (child.name.indexOf(vk + "=" + overrides[vk]) === -1) { ok = false; break; }
    }
    if (ok) return child;
  }
  return cs.children.length > 0 ? cs.children[0] : null;
}

async function createFallback(item) {
  var type = item.type || "other";
  var frame = figma.createFrame();
  frame.name = item.label || type;

  // Default sizing
  var w = item.width || 311;
  var h = item.height;

  // Helper: create text with font loading
  async function makeText(text, fontSize, color) {
    var t = figma.createText();
    await loadFont(t);
    t.characters = text;
    t.fontSize = fontSize || 14;
    if (color) t.fills = [{ type: "SOLID", color: color }];
    return t;
  }

  if (type === "input") {
    frame.layoutMode = "VERTICAL";
    frame.counterAxisAlignItems = "START";
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.87 } }];
    frame.strokeWeight = 1;
    frame.cornerRadius = item.cornerRadius || 8;
    h = h || 44;
    frame.resize(w, h);
    frame.paddingLeft = 14;
    frame.paddingRight = 14;
    frame.paddingTop = 0;
    frame.paddingBottom = 0;
    var inner = figma.createFrame();
    inner.layoutMode = "HORIZONTAL";
    inner.primaryAxisAlignItems = "CENTER";
    inner.counterAxisAlignItems = "CENTER";
    inner.resize(w - 28, h);
    inner.fills = [];
    if (item.text) {
      inner.appendChild(await makeText(item.text, item.fontSize || 14, { r: 0.65, g: 0.65, b: 0.68 }));
    }
    frame.appendChild(inner);
  } else if (type === "button") {
    frame.layoutMode = "HORIZONTAL";
    frame.primaryAxisAlignItems = "CENTER";
    frame.counterAxisAlignItems = "CENTER";
    frame.cornerRadius = item.cornerRadius || 8;
    h = h || 44;
    frame.resize(w, h);
    var fillColor = { r: 0.42, g: 0.25, b: 0.57 };
    if (item.fills && item.fills.length > 0) {
      var c = hexToRgb(item.fills[0]);
      if (c) fillColor = c;
    }
    frame.fills = [{ type: "SOLID", color: fillColor }];
    if (item.text) {
      frame.appendChild(await makeText(item.text, item.fontSize || 15, { r: 1, g: 1, b: 1 }));
    }
  } else if (type === "text") {
    frame.layoutMode = "HORIZONTAL";
    frame.counterAxisAlignItems = "CENTER";
    frame.fills = [];
    frame.counterAxisSizingMode = "AUTO";
    frame.resize(w, 20);
    if (item.text) {
      var textColor = null;
      if (item.fills && item.fills.length > 0) {
        var tc = hexToRgb(item.fills[0]);
        if (tc) textColor = tc;
      }
      frame.appendChild(await makeText(item.text, item.fontSize || 14, textColor));
    }
  } else if (type === "divider") {
    frame.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.92 } }];
    h = h || 1;
    frame.resize(w, h);
  } else if (type === "image") {
    frame.fills = [{ type: "SOLID", color: { r: 0.92, g: 0.92, b: 0.94 } }];
    frame.cornerRadius = item.cornerRadius || 0;
    h = h || 120;
    frame.resize(w, h);
    frame.layoutMode = "HORIZONTAL";
    frame.primaryAxisAlignItems = "CENTER";
    frame.counterAxisAlignItems = "CENTER";
    frame.appendChild(await makeText(item.text || "Image", 11, { r: 0.6, g: 0.6, b: 0.63 }));
  } else if (type === "checkbox") {
    frame.layoutMode = "HORIZONTAL";
    frame.primaryAxisAlignItems = "CENTER";
    frame.counterAxisAlignItems = "CENTER";
    frame.itemSpacing = 8;
    frame.fills = [];
    frame.counterAxisSizingMode = "AUTO";
    frame.resize(w, 20);
    var box = figma.createFrame();
    box.resize(16, 16);
    box.cornerRadius = 3;
    box.strokes = [{ type: "SOLID", color: { r: 0.7, g: 0.7, b: 0.73 } }];
    box.strokeWeight = 1.5;
    box.fills = [];
    frame.appendChild(box);
    if (item.text) {
      frame.appendChild(await makeText(item.text, item.fontSize || 13, null));
    }
  } else if (type === "card") {
    frame.layoutMode = "VERTICAL";
    frame.itemSpacing = 8;
    frame.paddingLeft = 16;
    frame.paddingRight = 16;
    frame.paddingTop = 16;
    frame.paddingBottom = 16;
    frame.cornerRadius = item.cornerRadius || 12;
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.92 } }];
    frame.strokeWeight = 1;
    h = h || 100;
    frame.resize(w, h);
    if (item.text) {
      frame.appendChild(await makeText(item.text, item.fontSize || 14, null));
    }
  } else {
    frame.layoutMode = "HORIZONTAL";
    frame.primaryAxisAlignItems = "CENTER";
    frame.counterAxisAlignItems = "CENTER";
    frame.paddingLeft = 12;
    frame.paddingRight = 12;
    frame.paddingTop = 8;
    frame.paddingBottom = 8;
    frame.cornerRadius = item.cornerRadius || 0;
    if (item.fills && item.fills.length > 0) {
      var c2 = hexToRgb(item.fills[0]);
      if (c2) frame.fills = [{ type: "SOLID", color: c2 }];
    }
    if (item.text) {
      frame.appendChild(await makeText(item.text, item.fontSize || 14, null));
    }
    if (h && h > 0) frame.resize(w, h);
  }

  return frame;
}

// ==================== MESSAGE HANDLER ====================
figma.ui.onmessage = async function (msg) {
  if (msg.type === "load-config") {
    var cfg = await loadConfig();
    figma.ui.postMessage({ type: "config-loaded", config: cfg });
  }

  if (msg.type === "save-config") {
    await saveConfig(msg.config);
    figma.ui.postMessage({ type: "config-saved", success: true });
  }

  if (msg.type === "scan-design-system") {
    figma.ui.postMessage({ type: "scan-progress", progress: 50, message: "Scanning components and styles..." });
    var ds = scanDesignSystem();
    figma.ui.postMessage({ type: "scan-result", data: ds });
  }

  if (msg.type === "generate-default-login") {
    try {
      var result = await generateDefaultLoginPage();
      figma.ui.postMessage({ type: "default-login-result", success: true, data: result });
      figma.notify("Login page generated!");
    } catch (e) {
      figma.ui.postMessage({ type: "default-login-result", success: false, error: e.message });
      figma.notify("Failed: " + e.message);
    }
  }

  if (msg.type === "generate-page") {
    try {
      var result = await generatePage(msg.elements);
      figma.ui.postMessage({ type: "generate-result", success: true, data: result });
      figma.notify("Generated: " + result.pageCount + " elements");
    } catch (e) {
      figma.ui.postMessage({ type: "generate-result", success: false, error: e.message });
      figma.notify("Failed: " + e.message);
    }
  }
};
