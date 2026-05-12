// Screenshot to Design - Figma Plugin
// code.js runs in Figma sandbox

figma.showUI(__html__, { width: 520, height: 680, themeColors: true });

// ==================== SCAN DESIGN SYSTEM ====================
function scanDesignSystem() {
  var components = [];
  var paintStyles = [];
  var textStyles = [];

  // Scan local paint styles
  var localPaints = figma.getLocalPaintStyles();
  for (var i = 0; i < localPaints.length; i++) {
    var ps = localPaints[i];
    var hex = "";
    if (ps.paints && ps.paints.length > 0 && ps.paints[0].type === "SOLID") {
      var c = ps.paints[0].color;
      var r = Math.round(c.r * 255);
      var g = Math.round(c.g * 255);
      var b = Math.round(c.b * 255);
      hex = "#" + r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0");
    }
    paintStyles.push({ id: ps.id, name: ps.name, hex: hex.toUpperCase() });
  }

  // Scan local text styles
  var localTexts = figma.getLocalTextStyles();
  for (var j = 0; j < localTexts.length; j++) {
    var ts = localTexts[j];
    textStyles.push({
      id: ts.id,
      name: ts.name,
      fontSize: ts.fontSize,
      fontFamily: ts.fontName ? ts.fontName.family : "",
    });
  }

  // Scan all pages for components
  function scanNode(node, pageName) {
    if (node.type === "COMPONENT") {
      var fills = [];
      if ("fills" in node && Array.isArray(node.fills)) {
        for (var fi = 0; fi < node.fills.length; fi++) {
          var f = node.fills[fi];
          if (f.type === "SOLID" && f.visible !== false) {
            var fc = f.color;
            var fr = Math.round(fc.r * 255);
            var fg = Math.round(fc.g * 255);
            var fb = Math.round(fc.b * 255);
            fills.push("#" + fr.toString(16).padStart(2, "0") + fg.toString(16).padStart(2, "0") + fb.toString(16).padStart(2, "0"));
          }
        }
      }
      var cr = ("cornerRadius" in node && node.cornerRadius !== figma.mixed) ? node.cornerRadius : null;
      var w = Math.round(node.width);
      var h = Math.round(node.height);

      // Collect variant properties
      var variants = {};
      if (node.parent && node.parent.type === "COMPONENT_SET") {
        var nameParts = node.name.split(",");
        for (var np = 0; np < nameParts.length; np++) {
          var eqIdx = nameParts[np].indexOf("=");
          if (eqIdx >= 0) {
            variants[nameParts[np].substring(0, eqIdx).trim()] = nameParts[np].substring(eqIdx + 1).trim();
          }
        }
      }

      components.push({
        id: node.id,
        name: node.name,
        pageName: pageName,
        width: w,
        height: h,
        fills: fills,
        cornerRadius: cr,
        variants: variants,
        parentId: node.parent ? (node.parent.type === "COMPONENT_SET" ? node.parent.id : null) : null,
        parentName: node.parent && node.parent.type === "COMPONENT_SET" ? node.parent.name : null,
      });
    }
    if ("children" in node) {
      for (var ci = 0; ci < node.children.length; ci++) {
        scanNode(node.children[ci], pageName);
      }
    }
  }

  // Also scan component sets as a summary
  var componentSets = [];
  for (var pi = 0; pi < figma.root.children.length; pi++) {
    var page = figma.root.children[pi];
    for (var ni = 0; ni < page.children.length; ni++) {
      if (page.children[ni].type === "COMPONENT_SET") {
        var cs = page.children[ni];
        var propDefs = cs.componentPropertyDefinitions;
        var props = {};
        for (var pk in propDefs) {
          if (propDefs[pk].variantOptions) {
            props[pk] = propDefs[pk].variantOptions;
          }
        }
        componentSets.push({
          id: cs.id,
          name: cs.name,
          pageName: page.name,
          variantProperties: props,
          childCount: cs.children.length,
        });
      }
    }
  }

  // Scan all components individually
  for (var pa = 0; pa < figma.root.children.length; pa++) {
    var pg = figma.root.children[pa];
    scanNode(pg, pg.name);
  }

  return {
    components: components,
    componentSets: componentSets,
    paintStyles: paintStyles,
    textStyles: textStyles,
  };
}

// ==================== GENERATE PAGE ====================
async function generatePage(elements) {
  var page = figma.createPage();
  page.name = "Generated - " + new Date().toLocaleDateString();

  var rootFrame = figma.createFrame();
  rootFrame.name = "Generated Layout";
  rootFrame.layoutMode = "VERTICAL";
  rootFrame.itemSpacing = elements.gap || 16;
  rootFrame.paddingLeft = elements.padding || 24;
  rootFrame.paddingRight = elements.padding || 24;
  rootFrame.paddingTop = elements.padding || 24;
  rootFrame.paddingBottom = elements.padding || 24;
  rootFrame.primaryAxisAlignItems = "CENTER";
  rootFrame.counterAxisAlignItems = "CENTER";
  rootFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  page.appendChild(rootFrame);

  for (var i = 0; i < elements.items.length; i++) {
    var item = elements.items[i];
    var node = null;

    if (item.matchType === "component" && item.componentId) {
      // Create component instance
      try {
        var compNode = figma.getNodeById(item.componentId);
        if (compNode) {
          node = compNode.createInstance();
          // Set text overrides
          if (item.text && node) {
            await overrideText(node, item.text);
          }
          // Set variant properties
          if (item.variantOverrides) {
            for (var vk in item.variantOverrides) {
              try {
                node.setProperties({ [vk]: item.variantOverrides[vk] });
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        // Component not found, create fallback
        node = createFallbackElement(item);
      }
    } else if (item.matchType === "componentSet" && item.componentSetId) {
      // Find the right variant from component set
      try {
        var csNode = figma.getNodeById(item.componentSetId);
        if (csNode && csNode.type === "COMPONENT_SET") {
          // Find matching child
          var matchComp = findMatchingVariant(csNode, item.variantOverrides || {});
          if (matchComp) {
            node = matchComp.createInstance();
            if (item.text) {
              await overrideText(node, item.text);
            }
          }
        }
      } catch (e) {
        node = createFallbackElement(item);
      }
    } else {
      // Fallback: create basic elements
      node = createFallbackElement(item);
    }

    if (node) {
      // Resize if specified
      if (item.width && item.height) {
        node.resize(item.width, item.height);
      }
      rootFrame.appendChild(node);
    }
  }

  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView([rootFrame]);
  return { success: true, pageCount: elements.items.length, pageName: page.name };
}

async function overrideText(node, text) {
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
  var textNode = findTextNode(node);
  if (textNode) {
    try {
      if (textNode.fontName === figma.mixed) {
        var segs = textNode.getStyledTextSegments(["fontName"]);
        if (segs.length > 0) await figma.loadFontAsync(segs[0].fontName);
      } else {
        await figma.loadFontAsync(textNode.fontName);
      }
      textNode.characters = text;
    } catch (e) {}
  }
}

function findMatchingVariant(componentSet, variantOverrides) {
  var children = componentSet.children;
  // Try to find exact match
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    var match = true;
    for (var vk in variantOverrides) {
      var expectedVal = variantOverrides[vk];
      // Check if child name contains this variant assignment
      if (child.name.indexOf(vk + "=" + expectedVal) === -1) {
        match = false;
        break;
      }
    }
    if (match) return child;
  }
  // Fallback: return first child
  return children.length > 0 ? children[0] : null;
}

function createFallbackElement(item) {
  var frame = figma.createFrame();
  frame.name = item.label || item.type || "Element";
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";
  frame.paddingLeft = 12;
  frame.paddingRight = 12;
  frame.paddingTop = 8;
  frame.paddingBottom = 8;
  frame.cornerRadius = item.cornerRadius || 0;

  if (item.fills && item.fills.length > 0) {
    var c = hexToRgb(item.fills[0]);
    if (c) {
      frame.fills = [{ type: "SOLID", color: c }];
    }
  }

  if (item.text) {
    var textNode = figma.createText();
    try { figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}
    textNode.characters = item.text;
    textNode.fontSize = item.fontSize || 14;
    frame.appendChild(textNode);
  }

  if (item.width) frame.resize(item.width, frame.height);
  return frame;
}

function hexToRgb(hex) {
  if (!hex || hex.length < 7) return null;
  var r = parseInt(hex.substring(1, 3), 16) / 255;
  var g = parseInt(hex.substring(3, 5), 16) / 255;
  var b = parseInt(hex.substring(5, 7), 16) / 255;
  return { r: r, g: g, b: b };
}

// ==================== MESSAGE HANDLER ====================
figma.ui.onmessage = async function (msg) {
  if (msg.type === "scan-design-system") {
    var ds = scanDesignSystem();
    figma.ui.postMessage({
      type: "scan-result",
      data: ds,
    });
  }

  if (msg.type === "generate-page") {
    try {
      var result = await generatePage(msg.elements);
      figma.ui.postMessage({ type: "generate-result", success: true, data: result });
      figma.notify("Page generated: " + result.pageCount + " elements");
    } catch (e) {
      figma.ui.postMessage({ type: "generate-result", success: false, error: e.message });
      figma.notify("Generation failed: " + e.message);
    }
  }
};
