# CloudFormation Template Validator ☁️

> **Validate AWS CloudFormation templates (JSON & YAML) locally in your browser before deployment.**

A professional, static developer utility web application designed for cloud engineers and DevOps practitioners. It reproduces local CloudFormation schema validation logic client-side, eliminating security risks by processing everything inside your browser without uploading code or requiring AWS API credentials.

---
## 📖 How To Use

### Option A: Upload a Template File
1. Drag and drop your `.json`, `.yaml`, or `.yml` CloudFormation template onto the upload dropzone.
2. Alternatively, click **Browse Files** and pick a template from your machine.
3. The file metadata (name, type, size) will display automatically.

### Option B: Paste or Edit Template Directly
1. Click the **Paste Template** tab.
2. Select your template format (`JSON` or `YAML`).
3. Paste your template code directly into the code editor.
4. Use **Load Example** to load a ready-to-test sample template, or click **Format JSON** to pretty-print JSON code.

### Running Validation
1. Choose your target **AWS Region** (default: `us-east-1`).
2. Toggle **Allow Capabilities** if your template requires IAM capabilities.
3. Click **Validate Template**.
4. Inspect the **Validation Workflow Tracker**, **Results Banner**, **Diagnostic Errors**, and **Resource Inspection Table**.

---

## ⚙️ How It Works (Validation Architecture)

```text
                  CloudFormation Template
                   (.json / .yaml / .yml)
                             │
                   ┌─────────┴─────────┐
                JSON File           YAML File
                   │                   │
             JSON.parse()        js-yaml Parser
                   │                   │
                   └─────────┬─────────┘
                             ▼
                      Template Object
                             │
                  Local Validation Engine
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
Root Key Validation    Parameter Validation   Resource Validation
                                                     │
                                                     ▼
                                            Attribute Validation
                                                     │
                                                     ▼
                                            Validation Results
```

### Validation Workflow Engine

1. **Syntax Parsing**: Parses JSON syntax with native `JSON.parse()` or YAML syntax with `js-yaml` (including custom handlers for AWS tags like `!Ref`, `!Sub`, `!GetAtt`, `!Join`, etc.).
2. **Root Key Validation**: Verifies root tags against allowed CloudFormation sections (`AWSTemplateFormatVersion`, `Resources`, `Parameters`, `Outputs`, etc.).
3. **Parameter Validation**: Ensures parameter definitions adhere to valid naming patterns.
4. **Resource Validation**: Checks resource types against recognized AWS service patterns (supporting service wildcards like `EC2::*`, `S3::*`).
5. **Resource Attribute Validation**: Enforces mandatory reference attributes and flags forbidden properties (e.g. `PublicIp` under `EC2::VPC`).

---

## 🛡️ Client-Side vs AWS API Validation

| Feature | Local Validation Engine | AWS API & Live Checks |
| :--- | :--- | :--- |
| **Execution Environment** | Client-Side (Browser JS) | AWS Cloud (boto3 / SDK) |
| **AWS Credentials Needed** | ❌ No (100% Private) | 🔑 Yes (Requires Backend) |
| **Syntax & Schema Check** | ✅ Passed | ✅ Passed |
| **Resource Type Check** | ✅ Passed | ✅ Passed |
| **Attribute Verification** | ✅ Passed | ✅ Passed |
| **Live AMI/VPC/SG Check** | ⚠️ Not Checked (Static) | ✅ Checked |

> 🔒 **Security First**: This static app never stores, requests, or transmits AWS access keys or secret keys.

---

## 🧪 Testing Invalid Templates

The repository includes sample invalid templates for testing error handling:
- `invalid-sample.yaml`
- `invalid-sample.json`

Uploading these will demonstrate diagnostic error output for root tag errors, invalid parameters, unsupported resource types, and forbidden attributes.

---

## 🛠️ Project Structure

```text
Cloudformation-Validator/
│
├── index.html           # Developer utility interface layout
├── style.css            # Dark/light theme styles & responsive design
├── script.js             # Client-side validation engine & DOM workflow
├── invalid-sample.yaml  # Test file for YAML validation errors
├── invalid-sample.json  # Test file for JSON validation errors
└── README.md            # GitHub documentation
```

---

## 👨‍💻 Author & Credits

Developed by **Santhosh P** | **Glacine AI**

