const maxDays = 30;

async function genReportLog(container, key, url) {
  const response = await fetch("logs/" + key + "_report.log");
  let statusLines = "";
  if (response.ok) {
    statusLines = await response.text();
  }

  const normalized = normalizeData(statusLines);
  const statusStream = constructStatusStream(key, url, normalized);
  container.appendChild(statusStream);
}

function constructStatusStream(key, url, uptimeData) {
  let streamContainer = templatize("statusStreamContainerTemplate");
  for (var ii = maxDays - 1; ii >= 0; ii--) {
    let line = constructStatusLine(key, ii, uptimeData[ii]);
    streamContainer.appendChild(line);
  }

  const lastSet = uptimeData[0];
  const color = getColor(lastSet);

  const container = templatize("statusContainerTemplate", {
    title: key,
    url: url,
    color: color,
    status: getStatusText(color),
    upTime: uptimeData.upTime,
  });

  container.appendChild(streamContainer);
  return container;
}

function constructStatusLine(key, relDay, upTimeArray) {
  let date = new Date();
  date.setDate(date.getDate() - relDay);

  return constructStatusSquare(key, date, upTimeArray);
}

function getColor(uptimeVal) {
  return uptimeVal == null
    ? "nodata"
    : uptimeVal == 1
    ? "success"
    : uptimeVal < 0.3
    ? "failure"
    : "partial";
}

function constructStatusSquare(key, date, uptimeVal) {
  const color = getColor(uptimeVal);
  let square = templatize("statusSquareTemplate", {
    color: color,
    "data-status": color,
  });

  square.addEventListener("mouseover", () => showTooltip(square, key, date, color));
  square.addEventListener("mousedown", () => showTooltip(square, key, date, color));
  square.addEventListener("mouseout", hideTooltip);
  return square;
}

let cloneId = 0;
function templatize(templateId, parameters) {
  let element = document.getElementById(templateId);
  if (!element) {
    console.error(`Template element with ID ${templateId} not found`);
    return document.createElement('div');
  }
  
  let clone = element.cloneNode(true);
  clone.id = "template_clone_" + cloneId++;
  clone.style.display = ''; // Remove any template hiding
  
  if (!parameters) {
    return clone;
  }

  applyTemplateSubstitutions(clone, parameters);
  return clone;
}

function applyTemplateSubstitutions(node, parameters) {
  const attributes = node.getAttributeNames();
  for (var ii = 0; ii < attributes.length; ii++) {
    const attr = attributes[ii];
    let attrVal = node.getAttribute(attr);
    node.setAttribute(attr, templatizeString(attrVal, parameters));
  }

  if (node.childElementCount === 0 && node.textContent) {
    node.textContent = templatizeString(node.textContent, parameters);
  } else {
    const children = Array.from(node.children);
    children.forEach((n) => {
      applyTemplateSubstitutions(n, parameters);
    });
  }
}

function templatizeString(text, parameters) {
  if (parameters && text) {
    return text.replace(/\$(\w+)/g, (_, key) => parameters[key] || '');
  }
  return text || '';
}

function getStatusText(color) {
  return color == "nodata"
    ? "无可用数据"
    : color == "success"
    ? "正常工作"
    : color == "failure"
    ? "大型事故"
    : color == "partial"
    ? "小型事故"
    : "Unknown";
}

function getStatusDescriptiveText(color) {
  return color == "nodata"
    ? "当天未进行运行状况检测。"
    : color == "success"
    ? "当天未检测出任何事故。"
    : color == "failure"
    ? "当天检测出了大型事故，站点完全无法工作。"
    : color == "partial"
    ? "当天检测出了小型事故，站点部分无法工作。"
    : "Unknown";
}

function getTooltip(key, date, quartile, color) {
  let statusText = getStatusText(color);
  return `${key} | ${date.toDateString()} : ${quartile} : ${statusText}`;
}

function create(tag, className) {
  let element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function normalizeData(statusLines) {
  const rows = statusLines.split("\n");
  const dateNormalized = splitRowsByDate(rows);

  let relativeDateMap = {};
  const now = Date.now();
  for (const [key, val] of Object.entries(dateNormalized)) {
    if (key == "upTime") {
      continue;
    }

    const relDays = getRelativeDays(now, new Date(key).getTime());
    relativeDateMap[relDays] = getDayAverage(val);
  }

  relativeDateMap.upTime = dateNormalized.upTime;
  return relativeDateMap;
}

function getDayAverage(val) {
  if (!val || val.length == 0) {
    return null;
  } else {
    return val.reduce((a, v) => a + v, 0) / val.length;
  }
}

function getRelativeDays(date1, date2) {
  return Math.floor(Math.abs((date1 - date2) / (24 * 3600 * 1000)));
}

function splitRowsByDate(rows) {
  let dateValues = {};
  let sum = 0,
    count = 0;
  for (var ii = rows.length - 1; ii >= 0; ii--) {
    const row = rows[ii];
    if (!row || !row.trim()) {
      continue;
    }

    const [dateTimeStr, resultStr] = row.split(",", 2);
    if (!dateTimeStr || !resultStr) continue;

    // Fix for Safari date parsing
    const parsedDate = dateTimeStr.replace(/-/g, "/") + " GMT";
    const dateTime = new Date(parsedDate);
    if (isNaN(dateTime.getTime())) continue;

    const dateStr = dateTime.toDateString();

    let resultArray = dateValues[dateStr] || [];
    dateValues[dateStr] = resultArray;
    
    if (Object.keys(dateValues).length > maxDays) {
      break;
    }

    let result = resultStr.trim() === "success" ? 1 : 0;
    sum += result;
    count++;

    resultArray.push(result);
  }

  const upTime = count ? ((sum / count) * 100).toFixed(2) + "%" : "--%";
  dateValues.upTime = upTime;
  return dateValues;
}

let tooltipTimeout = null;
function showTooltip(element, key, date, color) {
  clearTimeout(tooltipTimeout);
  const toolTipDiv = document.getElementById("tooltip");
  if (!toolTipDiv) return;

  const tooltipDateTime = document.getElementById("tooltipDateTime");
  const tooltipDescription = document.getElementById("tooltipDescription");
  const statusDiv = document.getElementById("tooltipStatus");

  if (tooltipDateTime) tooltipDateTime.textContent = date.toDateString();
  if (tooltipDescription) tooltipDescription.textContent = getStatusDescriptiveText(color);
  if (statusDiv) {
    statusDiv.textContent = getStatusText(color);
    statusDiv.className = "tooltipStatus " + color;
  }

  const rect = element.getBoundingClientRect();
  toolTipDiv.style.top = (rect.top + rect.height + window.scrollY + 10) + "px";
  toolTipDiv.style.left = (rect.left + rect.width / 2 - toolTipDiv.offsetWidth / 2) + "px";
  toolTipDiv.style.opacity = "1";
  toolTipDiv.style.visibility = "visible";
}

function hideTooltip() {
  tooltipTimeout = setTimeout(() => {
    const toolTipDiv = document.getElementById("tooltip");
    if (toolTipDiv) {
      toolTipDiv.style.opacity = "0";
      toolTipDiv.style.visibility = "hidden";
    }
  }, 300);
}

async function genAllReports() {
  try {
    const response = await fetch("urls.cfg");
    if (!response.ok) throw new Error("Failed to load config");
    
    const configText = await response.text();
    const configLines = configText.split("\n");
    const reportsContainer = document.getElementById("reports");
    
    if (!reportsContainer) {
      console.error("Reports container not found");
      return;
    }

    for (let ii = 0; ii < configLines.length; ii++) {
      const configLine = configLines[ii].trim();
      if (!configLine || configLine.startsWith("#")) continue;

      const [key, url] = configLine.split("=").map(s => s.trim());
      if (!key || !url) continue;

      await genReportLog(reportsContainer, key, url);
    }
  } catch (error) {
    console.error("Error generating reports:", error);
    // Optionally show error message to user
    const reportsContainer = document.getElementById("reports");
    if (reportsContainer) {
      reportsContainer.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle-fill"></i>
          无法加载状态数据，请稍后刷新重试
        </div>
      `;
    }
  }
}
