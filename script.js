/**
 * CloudFormation Template Validator - Client-side Engine
 * Reproduces python validation logic locally using Vanilla JS & js-yaml
 */

// Global Validation Rules & Schema Configurations
const validationConfig = {
  allowedRootKeys: [
    "AWSTemplateFormatVersion",
    "Description",
    "Metadata",
    "Parameters",
    "Mappings",
    "Conditions",
    "Transform",
    "Resources",
    "Outputs"
  ],
  allowedParameters: [
    "VpcCidr",
    "SubnetCidr",
    "Environment",
    "InstanceType",
    "KeyName",
    "DBName",
    "DBUser",
    "DBPassword",
    "SSHLocation"
  ],
  allowedResources: [
    "EC2::*",
    "S3::*",
    "IAM::*",
    "RDS::*",
    "Lambda::*",
    "DynamoDB::*",
    "SNS::*",
    "SQS::*",
    "AutoScaling::*",
    "ElasticLoadBalancingV2::*"
  ],
  requireRefAttributes: {
    "EC2::Subnet": [],
    "EC2::RouteTable": [],
    "EC2::InternetGateway": [],
    "EC2::VPCGatewayAttachment": [],
    "EC2::SecurityGroup": [],
    "EC2::Instance": []
  },
  allowAdditionalAttributes: {
    "EC2::VPC": ["CidrBlock", "EnableDnsSupport", "EnableDnsHostnames", "Tags"],
    "EC2::Subnet": ["CidrBlock", "MapPublicIpOnLaunch", "Tags"],
    "EC2::Instance": ["InstanceType", "ImageId", "KeyName", "SecurityGroupIds", "Tags"]
  },
  notAllowAttributes: {
    "EC2::VPC": ["PublicIp"],
    "EC2::Instance": ["RawPassword"]
  }
};

// Sample Templates
const sampleYamlTemplate = `AWSTemplateFormatVersion: '2010-09-09'
Description: Sample AWS CloudFormation VPC and EC2 Instance Template
Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - prod
  VpcCidr:
    Type: String
    Default: 10.0.0.0/16
Resources:
  MyVPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !Ref VpcCidr
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: !Sub \${Environment}-vpc

  MySubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref MyVPC
      CidrBlock: 10.0.1.0/24
      MapPublicIpOnLaunch: true

  MySecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Allow SSH access
      VpcId: !Ref MyVPC

  MyInstance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t3.micro
      ImageId: ami-0c55b159cbfafe1f0
      SubnetId: !Ref MySubnet
      SecurityGroupIds:
        - !Ref MySecurityGroup
Outputs:
  VPCId:
    Description: VPC ID
    Value: !Ref MyVPC`;

const sampleJsonTemplate = `{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "Sample AWS CloudFormation Template JSON",
  "Parameters": {
    "VpcCidr": {
      "Type": "String",
      "Default": "10.0.0.0/16"
    }
  },
  "Resources": {
    "MyVPC": {
      "Type": "AWS::EC2::VPC",
      "Properties": {
        "CidrBlock": { "Ref": "VpcCidr" }
      }
    }
  },
  "Outputs": {
    "VpcIdOutput": {
      "Value": { "Ref": "MyVPC" }
    }
  }
}`;

// State Variable
let currentRawContent = "";
let currentFileName = "";
let currentFileType = "YAML";

// Custom YAML Schema for CloudFormation Intrinsic Functions
let cfnYamlSchema = null;

function setupYamlCfnSchema() {
  if (typeof jsyaml === 'undefined') return;
  
  const tags = [
    'Ref', 'Sub', 'GetAtt', 'Join', 'Select', 'GetAZs',
    'FindInMap', 'ImportValue', 'Split', 'If', 'Equals',
    'And', 'Or', 'Not', 'Condition', 'Base64'
  ];

  const typeObjects = tags.map(tag => {
    return new jsyaml.Type('!' + tag, {
      kind: 'scalar',
      construct: function (data) {
        let obj = {};
        obj[tag] = data;
        return obj;
      },
      represent: function (data) { return data; }
    });
  }).concat(tags.map(tag => {
    return new jsyaml.Type('!' + tag, {
      kind: 'sequence',
      construct: function (data) {
        let obj = {};
        obj[tag] = data;
        return obj;
      },
      represent: function (data) { return data; }
    });
  })).concat(tags.map(tag => {
    return new jsyaml.Type('!' + tag, {
      kind: 'mapping',
      construct: function (data) {
        let obj = {};
        obj[tag] = data;
        return obj;
      },
      represent: function (data) { return data; }
    });
  }));

  cfnYamlSchema = jsyaml.DEFAULT_SCHEMA.extend(typeObjects);
}

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  setupYamlCfnSchema();

  // Tab elements
  const tabUploadBtn = document.getElementById('tabUploadBtn');
  const tabPasteBtn = document.getElementById('tabPasteBtn');
  const uploadTabContent = document.getElementById('uploadTabContent');
  const pasteTabContent = document.getElementById('pasteTabContent');

  // File Upload elements
  const dropZone = document.getElementById('dropZone');
  const templateFileInput = document.getElementById('templateFile');
  const fileInfoCard = document.getElementById('fileInfoCard');
  const fileNameEl = document.getElementById('fileName');
  const fileTypeEl = document.getElementById('fileType');
  const fileSizeEl = document.getElementById('fileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');

  // Editor elements
  const templateEditor = document.getElementById('templateEditor');
  const formatJsonBtn = document.getElementById('formatJsonBtn');
  const loadExampleBtn = document.getElementById('loadExampleBtn');
  const clearEditorBtn = document.getElementById('clearEditorBtn');
  const detectedFormatBadge = document.getElementById('detectedFormatBadge');
  const pasteFormatRadios = document.querySelectorAll('input[name="pasteFormat"]');

  // Action & Results elements
  const validateBtn = document.getElementById('validateBtn');
  const resultsSection = document.getElementById('resultsSection');

  // Event Listeners for Tabs
  tabUploadBtn.addEventListener('click', () => {
    tabUploadBtn.classList.add('active');
    tabPasteBtn.classList.remove('active');
    uploadTabContent.classList.add('active');
    pasteTabContent.classList.remove('active');
  });

  tabPasteBtn.addEventListener('click', () => {
    tabPasteBtn.classList.add('active');
    tabUploadBtn.classList.remove('active');
    pasteTabContent.classList.add('active');
    uploadTabContent.classList.remove('active');
    if (!templateEditor.value.trim() && currentRawContent) {
      templateEditor.value = currentRawContent;
    }
  });

  // Drag and drop setup
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleSelectedFile(files[0]);
    }
  });

  templateFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', () => {
    currentRawContent = "";
    currentFileName = "";
    templateFileInput.value = "";
    fileInfoCard.classList.add('hidden');
    dropZone.classList.remove('hidden');
    detectedFormatBadge.textContent = "AUTO";
  });

  // Editor Actions
  loadExampleBtn.addEventListener('click', () => {
    const selectedFormat = document.querySelector('input[name="pasteFormat"]:checked').value;
    if (selectedFormat === 'json') {
      templateEditor.value = sampleJsonTemplate;
      currentFileType = "JSON";
    } else {
      templateEditor.value = sampleYamlTemplate;
      currentFileType = "YAML";
    }
    currentRawContent = templateEditor.value;
    detectedFormatBadge.textContent = currentFileType;
  });

  clearEditorBtn.addEventListener('click', () => {
    templateEditor.value = "";
    currentRawContent = "";
    detectedFormatBadge.textContent = "AUTO";
  });

  formatJsonBtn.addEventListener('click', () => {
    const text = templateEditor.value.trim();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      templateEditor.value = JSON.stringify(parsed, null, 2);
      currentFileType = "JSON";
      detectedFormatBadge.textContent = "JSON";
    } catch (e) {
      alert("Selected content is not valid JSON. Cannot format.");
    }
  });

  templateEditor.addEventListener('input', () => {
    currentRawContent = templateEditor.value;
    detectFormatFromContent(currentRawContent);
  });

  pasteFormatRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'json') {
        detectedFormatBadge.textContent = "JSON";
      } else {
        detectedFormatBadge.textContent = "YAML";
      }
    });
  });

  // Validate Button Handler
  validateBtn.addEventListener('click', () => {
    runValidationWorkflow();
  });

  // File Handling Logic
  function handleSelectedFile(file) {
    currentFileName = file.name;
    const sizeKB = (file.size / 1024).toFixed(1) + " KB";
    const ext = file.name.split('.').pop().toLowerCase();
    currentFileType = (ext === 'json') ? 'JSON' : 'YAML';

    const reader = new FileReader();
    reader.onload = (e) => {
      currentRawContent = e.target.result;
      templateEditor.value = currentRawContent;

      fileNameEl.textContent = currentFileName;
      fileTypeEl.textContent = currentFileType;
      fileSizeEl.textContent = sizeKB;

      dropZone.classList.add('hidden');
      fileInfoCard.classList.remove('hidden');
      detectedFormatBadge.textContent = currentFileType;
    };
    reader.readAsText(file);
  }

  function detectFormatFromContent(content) {
    const trimmed = content.trim();
    if (!trimmed) {
      detectedFormatBadge.textContent = "AUTO";
      return;
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      detectedFormatBadge.textContent = "JSON";
      currentFileType = "JSON";
    } else {
      detectedFormatBadge.textContent = "YAML";
      currentFileType = "YAML";
    }
  }
});

// Modular Local Validation Functions (Python cf-validator reference reproduction)

function parseTemplate(rawText) {
  if (!rawText || !rawText.trim()) {
    return { success: false, error: "Empty template. Please upload or paste a CloudFormation template." };
  }
  const text = rawText.trim();
  let data = null;

  // Try JSON first if starts with {
  if (text.startsWith('{')) {
    try {
      data = JSON.parse(text);
      return { success: true, format: 'JSON', data: data };
    } catch (err) {
      return { success: false, error: "Invalid JSON syntax: " + err.message };
    }
  }

  // Use js-yaml parser with CloudFormation schema
  try {
    data = jsyaml.load(text, { schema: cfnYamlSchema });
    if (typeof data !== 'object' || data === null) {
      return { success: false, error: "Parsed YAML content did not yield a valid CloudFormation object structure." };
    }
    return { success: true, format: 'YAML', data: data };
  } catch (err) {
    // Fallback: try standard JSON parse just in case
    try {
      data = JSON.parse(text);
      return { success: true, format: 'JSON', data: data };
    } catch (e2) {
      return { success: false, error: "Invalid YAML/JSON syntax: " + err.message };
    }
  }
}

function validateRootKeys(templateObj) {
  const rootKeys = Object.keys(templateObj);
  const invalidKeys = [];

  rootKeys.forEach(key => {
    if (!validationConfig.allowedRootKeys.includes(key)) {
      invalidKeys.push(key);
    }
  });

  if (invalidKeys.length > 0) {
    return {
      valid: false,
      message: `Root Tags are not valid. Unknown key(s): ${invalidKeys.join(', ')}`,
      invalidKeys: invalidKeys
    };
  }

  return { valid: true, message: "Root keys are valid." };
}

function validateParameters(templateObj) {
  if (!templateObj.Parameters) {
    return { valid: true, message: "No parameters defined." };
  }

  const paramKeys = Object.keys(templateObj.Parameters);
  const invalidParams = [];

  paramKeys.forEach(param => {
    // Check if parameter is allowed or follows basic convention
    if (validationConfig.allowedParameters.length > 0) {
      const isAllowed = validationConfig.allowedParameters.includes(param) || 
                        param.endsWith('Cidr') || 
                        param.endsWith('Id') || 
                        param.endsWith('Name') || 
                        param.endsWith('Type') || 
                        param.endsWith('Environment');
      if (!isAllowed) {
        invalidParams.push(param);
      }
    }
  });

  if (invalidParams.length > 0) {
    return {
      valid: false,
      message: `Parameters are not valid. Flagged parameter(s): ${invalidParams.join(', ')}`,
      invalidParams: invalidParams
    };
  }

  return { valid: true, message: "Parameters are valid." };
}

function convertResourceTypeKey(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') return typeStr;
  if (typeStr.startsWith("AWS::")) {
    return typeStr.replace("AWS::", "");
  }
  return typeStr;
}

function isResourceTypeAllowed(convertedType) {
  return validationConfig.allowedResources.some(rule => {
    if (rule.endsWith("::*")) {
      const prefix = rule.replace("::*", "");
      return convertedType.startsWith(prefix + "::");
    }
    return rule === convertedType;
  });
}

function validateResources(templateObj) {
  if (!templateObj.Resources || typeof templateObj.Resources !== 'object') {
    return { valid: false, message: "Missing or invalid 'Resources' root section in CloudFormation template.", invalidResources: [] };
  }

  const resourceEntries = Object.entries(templateObj.Resources);
  if (resourceEntries.length === 0) {
    return { valid: false, message: "'Resources' section is empty.", invalidResources: [] };
  }

  const invalidResources = [];
  const parsedResources = [];

  resourceEntries.forEach(([logicalId, resObj]) => {
    const rawType = resObj ? resObj.Type : null;
    const convertedType = convertResourceTypeKey(rawType);
    const isAllowed = rawType && isResourceTypeAllowed(convertedType);

    const resRecord = {
      logicalId: logicalId,
      rawType: rawType || "UNDEFINED",
      convertedType: convertedType || "UNDEFINED",
      valid: isAllowed
    };
    parsedResources.push(resRecord);

    if (!isAllowed) {
      invalidResources.push(resRecord);
    }
  });

  if (invalidResources.length > 0) {
    return {
      valid: false,
      message: `Resources are not valid. Disallowed or invalid resource types found.`,
      invalidResources: invalidResources,
      allResources: parsedResources
    };
  }

  return { valid: true, message: "Resources are valid.", allResources: parsedResources };
}

function validateAttributes(templateObj, parsedResources) {
  const errors = [];
  const resources = templateObj.Resources || {};

  parsedResources.forEach(res => {
    const resObj = resources[res.logicalId];
    if (!resObj) return;

    const convertedType = res.convertedType;
    const properties = resObj.Properties || {};

    // 1. Check Not Allowed Attributes
    const notAllowedList = validationConfig.notAllowAttributes[convertedType] || [];
    notAllowedList.forEach(attr => {
      if (attr in properties) {
        errors.push({
          type: "Forbidden Attribute",
          resource: res.logicalId,
          resourceType: res.rawType,
          property: attr,
          message: `Not Allow Attribute: ${attr}`
        });
      }
    });

    // 2. Check Required Reference Attributes
    const requireRefList = validationConfig.requireRefAttributes[convertedType] || [];
    requireRefList.forEach(attr => {
      if (!(attr in properties)) {
        errors.push({
          type: "Missing Reference Attribute",
          resource: res.logicalId,
          resourceType: res.rawType,
          property: attr,
          message: `Not Reference Attribute: ${attr}`
        });
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// Main Execution Workflow & Dashboard Updater
function runValidationWorkflow() {
  const content = currentRawContent || document.getElementById('templateEditor').value;
  const resultsSection = document.getElementById('resultsSection');
  const resultBanner = document.getElementById('resultBanner');
  const bannerIcon = document.getElementById('bannerIcon');
  const bannerTitle = document.getElementById('bannerTitle');
  const bannerSubtitle = document.getElementById('bannerSubtitle');
  const errorsContainer = document.getElementById('errorsContainer');
  const errorList = document.getElementById('errorList');

  // Reset Progress Indicators
  updateProgressStep('parse', 'pending');
  updateProgressStep('root', 'pending');
  updateProgressStep('params', 'pending');
  updateProgressStep('resources', 'pending');
  updateProgressStep('attributes', 'pending');

  const diagnosticErrors = [];

  // Helper function to update status element class & text
  function setStatusElement(id, isValid, textValue) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = textValue;
    el.className = "status-val " + (isValid ? "success" : "failed");
  }

  // 1. Parse Step
  const parseRes = parseTemplate(content);
  if (!parseRes.success) {
    updateProgressStep('parse', 'failed');
    setStatusElement('statusSyntax', false, "Invalid");
    renderResultsBanner(false, "LOCAL VALIDATION FAILED", parseRes.error);
    renderErrorItems([{
      type: "Parse Error",
      resource: "N/A",
      resourceType: "N/A",
      property: "Syntax",
      message: parseRes.error
    }]);
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  updateProgressStep('parse', 'done');
  setStatusElement('statusSyntax', true, "Valid (" + parseRes.format + ")");

  const tObj = parseRes.data;

  // 2. Root Keys Validation
  const rootRes = validateRootKeys(tObj);
  if (rootRes.valid) {
    updateProgressStep('root', 'done');
    setStatusElement('statusRootKeys', true, "Valid");
  } else {
    updateProgressStep('root', 'failed');
    setStatusElement('statusRootKeys', false, "Invalid");
    diagnosticErrors.push({
      type: "Root Tag Error",
      resource: "Root",
      resourceType: "Template",
      property: "RootKeys",
      message: rootRes.message
    });
  }

  // 3. Parameters Validation
  const paramRes = validateParameters(tObj);
  if (paramRes.valid) {
    updateProgressStep('params', 'done');
    setStatusElement('statusParameters', true, "Valid");
  } else {
    updateProgressStep('params', 'failed');
    setStatusElement('statusParameters', false, "Invalid");
    diagnosticErrors.push({
      type: "Parameter Error",
      resource: "Parameters",
      resourceType: "AWS::Parameter",
      property: "Name",
      message: paramRes.message
    });
  }

  // 4. Resources Validation
  const resourceRes = validateResources(tObj);
  const allResources = resourceRes.allResources || [];
  if (resourceRes.valid) {
    updateProgressStep('resources', 'done');
    setStatusElement('statusResources', true, "Valid");
  } else {
    updateProgressStep('resources', 'failed');
    setStatusElement('statusResources', false, "Invalid");
    if (resourceRes.invalidResources) {
      resourceRes.invalidResources.forEach(r => {
        diagnosticErrors.push({
          type: "Invalid Resource Type",
          resource: r.logicalId,
          resourceType: r.rawType,
          property: "Type",
          message: `Resource type '${r.rawType}' is not included in the allowed resources configuration.`
        });
      });
    }
  }

  // 5. Attributes Validation
  const attrRes = validateAttributes(tObj, allResources);
  if (attrRes.valid) {
    updateProgressStep('attributes', 'done');
    setStatusElement('statusAttributes', true, "Valid");
  } else {
    updateProgressStep('attributes', 'failed');
    setStatusElement('statusAttributes', false, "Invalid");
    attrRes.errors.forEach(err => diagnosticErrors.push(err));
  }

  // Render Metrics & Resource Table
  renderSummaryMetrics(tObj, allResources);

  // Render Overall Results
  const isAllValid = diagnosticErrors.length === 0;
  if (isAllValid) {
    renderResultsBanner(true, "LOCAL VALIDATION PASSED", "Template syntax, root keys, parameters, resources, and attributes passed client-side validation rules.");
    errorsContainer.classList.add('hidden');
  } else {
    renderResultsBanner(false, "LOCAL VALIDATION FAILED", `${diagnosticErrors.length} validation error(s) found in local schema inspection.`);
    renderErrorItems(diagnosticErrors);
  }

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function updateProgressStep(stepKey, status) {
  const el = document.querySelector(`.progress-list li[data-step="${stepKey}"]`);
  if (!el) return;
  const icon = el.querySelector('.step-icon');
  el.classList.remove('done', 'failed');
  if (status === 'done') {
    el.classList.add('done');
    icon.textContent = "✓";
  } else if (status === 'failed') {
    el.classList.add('failed');
    icon.textContent = "✕";
  } else {
    icon.textContent = "○";
  }
}

function renderResultsBanner(isSuccess, title, subtitle) {
  const banner = document.getElementById('resultBanner');
  const icon = document.getElementById('bannerIcon');
  const t = document.getElementById('bannerTitle');
  const sub = document.getElementById('bannerSubtitle');

  banner.className = "result-banner " + (isSuccess ? "banner-success" : "banner-error");
  icon.textContent = isSuccess ? "✓" : "✕";
  t.textContent = title;
  sub.textContent = subtitle;
}

function renderErrorItems(errors) {
  const container = document.getElementById('errorsContainer');
  const list = document.getElementById('errorList');
  list.innerHTML = "";

  errors.forEach(err => {
    const item = document.createElement('div');
    item.className = 'error-item';
    item.innerHTML = `
      <div class="error-header">
        <span>Type: ${err.type}</span>
        <span>${err.resource !== 'N/A' ? 'Resource: ' + err.resource : ''}</span>
      </div>
      <div class="error-msg">${err.message}</div>
      <div class="error-meta">
        <span>Resource Type: ${err.resourceType}</span>
        <span>Property: ${err.property}</span>
      </div>
    `;
    list.appendChild(item);
  });

  container.classList.remove('hidden');
}

function renderSummaryMetrics(tObj, allResources) {
  document.getElementById('summaryRootKeysCount').textContent = Object.keys(tObj).length;
  document.getElementById('summaryParamsCount').textContent = tObj.Parameters ? Object.keys(tObj.Parameters).length : 0;
  document.getElementById('summaryResourcesCount').textContent = allResources.length;
  document.getElementById('summaryOutputsCount').textContent = tObj.Outputs ? Object.keys(tObj.Outputs).length : 0;

  const tbody = document.getElementById('resourceTableBody');
  tbody.innerHTML = "";

  if (allResources.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No resources found</td></tr>`;
    return;
  }

  allResources.forEach(res => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${res.logicalId}</strong></td>
      <td>${res.rawType}</td>
      <td>${res.convertedType}</td>
      <td><span class="status-val ${res.valid ? 'success' : 'failed'}">${res.valid ? 'Valid' : 'Disallowed'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}
