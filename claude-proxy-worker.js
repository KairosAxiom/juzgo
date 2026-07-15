var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// ============================================================
// MOCK_PACKAGES — dummy eSIM catalogue (45 destinations).
// Package IDs match the package_id column seeded in Supabase esim_plans.
// Prices are already in SGD. When Airalo onboarding completes, set the
// AIRALO_CLIENT_ID / AIRALO_CLIENT_SECRET worker secrets and the /airalo/*
// routes below will call the live API instead of this object.
// ============================================================
var MOCK_PACKAGES = {
  "data": [
    {
      "slug": "singapore",
      "country_code": "SG",
      "title": "Singapore",
      "image": {
        "url": "https://cdn.airalo.com/images/sg.png"
      },
      "operators": [
        {
          "id": 1,
          "title": "Changi Connect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "sg-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "sg-15days-3gb",
              "type": "sim",
              "price": 9.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "sg-30days-5gb",
              "type": "sim",
              "price": 14.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "sg-30days-10gb",
              "type": "sim",
              "price": 22.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "japan",
      "country_code": "JP",
      "title": "Japan",
      "image": {
        "url": "https://cdn.airalo.com/images/jp.png"
      },
      "operators": [
        {
          "id": 2,
          "title": "Sakura Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "jp-7days-1gb",
              "type": "sim",
              "price": 6.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "jp-15days-3gb",
              "type": "sim",
              "price": 12.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "jp-30days-5gb",
              "type": "sim",
              "price": 18.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "jp-30days-10gb",
              "type": "sim",
              "price": 29.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "jp-30days-unlimited",
              "type": "sim",
              "price": 45.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "south-korea",
      "country_code": "KR",
      "title": "South Korea",
      "image": {
        "url": "https://cdn.airalo.com/images/kr.png"
      },
      "operators": [
        {
          "id": 3,
          "title": "Seoul Connect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "kr-7days-1gb",
              "type": "sim",
              "price": 6.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "kr-15days-3gb",
              "type": "sim",
              "price": 11.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "kr-30days-5gb",
              "type": "sim",
              "price": 17.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "kr-30days-10gb",
              "type": "sim",
              "price": 27.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "kr-30days-unlimited",
              "type": "sim",
              "price": 43.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "thailand",
      "country_code": "TH",
      "title": "Thailand",
      "image": {
        "url": "https://cdn.airalo.com/images/th.png"
      },
      "operators": [
        {
          "id": 4,
          "title": "ThaiFi",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "th-7days-1gb",
              "type": "sim",
              "price": 4.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "th-15days-3gb",
              "type": "sim",
              "price": 7.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "th-30days-5gb",
              "type": "sim",
              "price": 11.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "th-30days-10gb",
              "type": "sim",
              "price": 18.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "th-30days-unlimited",
              "type": "sim",
              "price": 29.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "malaysia",
      "country_code": "MY",
      "title": "Malaysia",
      "image": {
        "url": "https://cdn.airalo.com/images/my.png"
      },
      "operators": [
        {
          "id": 5,
          "title": "Boleh Connect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "my-7days-1gb",
              "type": "sim",
              "price": 4.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "my-15days-3gb",
              "type": "sim",
              "price": 7.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "my-30days-5gb",
              "type": "sim",
              "price": 11.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "my-30days-10gb",
              "type": "sim",
              "price": 17.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "indonesia",
      "country_code": "ID",
      "title": "Indonesia",
      "image": {
        "url": "https://cdn.airalo.com/images/id.png"
      },
      "operators": [
        {
          "id": 6,
          "title": "Nusantara Net",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "id-7days-1gb",
              "type": "sim",
              "price": 4.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "id-15days-3gb",
              "type": "sim",
              "price": 7.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "id-30days-5gb",
              "type": "sim",
              "price": 11.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "id-30days-10gb",
              "type": "sim",
              "price": 17.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "vietnam",
      "country_code": "VN",
      "title": "Vietnam",
      "image": {
        "url": "https://cdn.airalo.com/images/vn.png"
      },
      "operators": [
        {
          "id": 7,
          "title": "Saigon Signal",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "vn-7days-1gb",
              "type": "sim",
              "price": 3.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "vn-15days-3gb",
              "type": "sim",
              "price": 6.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "vn-30days-5gb",
              "type": "sim",
              "price": 10.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "vn-30days-10gb",
              "type": "sim",
              "price": 16.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "philippines",
      "country_code": "PH",
      "title": "Philippines",
      "image": {
        "url": "https://cdn.airalo.com/images/ph.png"
      },
      "operators": [
        {
          "id": 8,
          "title": "Isla Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ph-7days-1gb",
              "type": "sim",
              "price": 4.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ph-15days-3gb",
              "type": "sim",
              "price": 7.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ph-30days-5gb",
              "type": "sim",
              "price": 11.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ph-30days-10gb",
              "type": "sim",
              "price": 18.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "taiwan",
      "country_code": "TW",
      "title": "Taiwan",
      "image": {
        "url": "https://cdn.airalo.com/images/tw.png"
      },
      "operators": [
        {
          "id": 9,
          "title": "Formosa Link",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "tw-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "tw-15days-3gb",
              "type": "sim",
              "price": 9.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "tw-30days-5gb",
              "type": "sim",
              "price": 14.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "tw-30days-10gb",
              "type": "sim",
              "price": 23.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "tw-30days-unlimited",
              "type": "sim",
              "price": 36.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "hong-kong",
      "country_code": "HK",
      "title": "Hong Kong",
      "image": {
        "url": "https://cdn.airalo.com/images/hk.png"
      },
      "operators": [
        {
          "id": 10,
          "title": "Harbour Data",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "hk-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "hk-15days-3gb",
              "type": "sim",
              "price": 10.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "hk-30days-5gb",
              "type": "sim",
              "price": 15.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "hk-30days-10gb",
              "type": "sim",
              "price": 24.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "china",
      "country_code": "CN",
      "title": "China",
      "image": {
        "url": "https://cdn.airalo.com/images/cn.png"
      },
      "operators": [
        {
          "id": 11,
          "title": "Panda Roam",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "cn-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "cn-15days-3gb",
              "type": "sim",
              "price": 9.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "cn-30days-5gb",
              "type": "sim",
              "price": 14.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "cn-30days-10gb",
              "type": "sim",
              "price": 23.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "india",
      "country_code": "IN",
      "title": "India",
      "image": {
        "url": "https://cdn.airalo.com/images/in.png"
      },
      "operators": [
        {
          "id": 12,
          "title": "Lotus Telecom",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "in-7days-1gb",
              "type": "sim",
              "price": 3.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "in-15days-3gb",
              "type": "sim",
              "price": 6.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "in-30days-5gb",
              "type": "sim",
              "price": 9.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "in-30days-10gb",
              "type": "sim",
              "price": 15.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "cambodia",
      "country_code": "KH",
      "title": "Cambodia",
      "image": {
        "url": "https://cdn.airalo.com/images/kh.png"
      },
      "operators": [
        {
          "id": 13,
          "title": "Angkor Air Data",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "kh-7days-1gb",
              "type": "sim",
              "price": 4.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "kh-15days-3gb",
              "type": "sim",
              "price": 7.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "kh-30days-5gb",
              "type": "sim",
              "price": 11.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "kh-30days-10gb",
              "type": "sim",
              "price": 17.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "sri-lanka",
      "country_code": "LK",
      "title": "Sri Lanka",
      "image": {
        "url": "https://cdn.airalo.com/images/lk.png"
      },
      "operators": [
        {
          "id": 14,
          "title": "Ceylon Cell",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "lk-7days-1gb",
              "type": "sim",
              "price": 3.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "lk-15days-3gb",
              "type": "sim",
              "price": 6.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "lk-30days-5gb",
              "type": "sim",
              "price": 10.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "lk-30days-10gb",
              "type": "sim",
              "price": 16.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "macau",
      "country_code": "MO",
      "title": "Macau",
      "image": {
        "url": "https://cdn.airalo.com/images/mo.png"
      },
      "operators": [
        {
          "id": 15,
          "title": "Lotus Bridge Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "mo-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "mo-15days-3gb",
              "type": "sim",
              "price": 9.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "mo-30days-5gb",
              "type": "sim",
              "price": 14.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "mo-30days-10gb",
              "type": "sim",
              "price": 23.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "united-arab-emirates",
      "country_code": "AE",
      "title": "United Arab Emirates",
      "image": {
        "url": "https://cdn.airalo.com/images/ae.png"
      },
      "operators": [
        {
          "id": 16,
          "title": "Falcon Net",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ae-7days-1gb",
              "type": "sim",
              "price": 6.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ae-15days-3gb",
              "type": "sim",
              "price": 12.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ae-30days-5gb",
              "type": "sim",
              "price": 19.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ae-30days-10gb",
              "type": "sim",
              "price": 30.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "ae-30days-unlimited",
              "type": "sim",
              "price": 47.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "turkey",
      "country_code": "TR",
      "title": "Turkey",
      "image": {
        "url": "https://cdn.airalo.com/images/tr.png"
      },
      "operators": [
        {
          "id": 17,
          "title": "Bosphorus Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "tr-7days-1gb",
              "type": "sim",
              "price": 4.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "tr-15days-3gb",
              "type": "sim",
              "price": 8.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "tr-30days-5gb",
              "type": "sim",
              "price": 13.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "tr-30days-10gb",
              "type": "sim",
              "price": 20.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "qatar",
      "country_code": "QA",
      "title": "Qatar",
      "image": {
        "url": "https://cdn.airalo.com/images/qa.png"
      },
      "operators": [
        {
          "id": 18,
          "title": "Pearl Data",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "qa-7days-1gb",
              "type": "sim",
              "price": 6.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "qa-15days-3gb",
              "type": "sim",
              "price": 12.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "qa-30days-5gb",
              "type": "sim",
              "price": 19.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "qa-30days-10gb",
              "type": "sim",
              "price": 30.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "saudi-arabia",
      "country_code": "SA",
      "title": "Saudi Arabia",
      "image": {
        "url": "https://cdn.airalo.com/images/sa.png"
      },
      "operators": [
        {
          "id": 19,
          "title": "Oasis Roam",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "sa-7days-1gb",
              "type": "sim",
              "price": 6.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "sa-15days-3gb",
              "type": "sim",
              "price": 11.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "sa-30days-5gb",
              "type": "sim",
              "price": 17.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "sa-30days-10gb",
              "type": "sim",
              "price": 27.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "united-kingdom",
      "country_code": "GB",
      "title": "United Kingdom",
      "image": {
        "url": "https://cdn.airalo.com/images/gb.png"
      },
      "operators": [
        {
          "id": 20,
          "title": "BritConnect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "gb-7days-1gb",
              "type": "sim",
              "price": 5.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "gb-15days-3gb",
              "type": "sim",
              "price": 10.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "gb-30days-5gb",
              "type": "sim",
              "price": 16.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "gb-30days-10gb",
              "type": "sim",
              "price": 25.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "gb-30days-unlimited",
              "type": "sim",
              "price": 39.5,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "france",
      "country_code": "FR",
      "title": "France",
      "image": {
        "url": "https://cdn.airalo.com/images/fr.png"
      },
      "operators": [
        {
          "id": 21,
          "title": "Lumière Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "fr-7days-1gb",
              "type": "sim",
              "price": 5.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "fr-15days-3gb",
              "type": "sim",
              "price": 10.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "fr-30days-5gb",
              "type": "sim",
              "price": 16.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "fr-30days-10gb",
              "type": "sim",
              "price": 25.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "fr-30days-unlimited",
              "type": "sim",
              "price": 39.5,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "germany",
      "country_code": "DE",
      "title": "Germany",
      "image": {
        "url": "https://cdn.airalo.com/images/de.png"
      },
      "operators": [
        {
          "id": 22,
          "title": "Alpen Data",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "de-7days-1gb",
              "type": "sim",
              "price": 5.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "de-15days-3gb",
              "type": "sim",
              "price": 10.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "de-30days-5gb",
              "type": "sim",
              "price": 16.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "de-30days-10gb",
              "type": "sim",
              "price": 25.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "italy",
      "country_code": "IT",
      "title": "Italy",
      "image": {
        "url": "https://cdn.airalo.com/images/it.png"
      },
      "operators": [
        {
          "id": 23,
          "title": "Vespa Net",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "it-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "it-15days-3gb",
              "type": "sim",
              "price": 10.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "it-30days-5gb",
              "type": "sim",
              "price": 15.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "it-30days-10gb",
              "type": "sim",
              "price": 24.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "spain",
      "country_code": "ES",
      "title": "Spain",
      "image": {
        "url": "https://cdn.airalo.com/images/es.png"
      },
      "operators": [
        {
          "id": 24,
          "title": "Sol Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "es-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "es-15days-3gb",
              "type": "sim",
              "price": 10.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "es-30days-5gb",
              "type": "sim",
              "price": 15.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "es-30days-10gb",
              "type": "sim",
              "price": 24.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "portugal",
      "country_code": "PT",
      "title": "Portugal",
      "image": {
        "url": "https://cdn.airalo.com/images/pt.png"
      },
      "operators": [
        {
          "id": 25,
          "title": "Atlantico Cell",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "pt-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "pt-15days-3gb",
              "type": "sim",
              "price": 9.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "pt-30days-5gb",
              "type": "sim",
              "price": 14.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "pt-30days-10gb",
              "type": "sim",
              "price": 23.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "netherlands",
      "country_code": "NL",
      "title": "Netherlands",
      "image": {
        "url": "https://cdn.airalo.com/images/nl.png"
      },
      "operators": [
        {
          "id": 26,
          "title": "Tulip Telecom",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "nl-7days-1gb",
              "type": "sim",
              "price": 5.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "nl-15days-3gb",
              "type": "sim",
              "price": 10.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "nl-30days-5gb",
              "type": "sim",
              "price": 16.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "nl-30days-10gb",
              "type": "sim",
              "price": 25.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "switzerland",
      "country_code": "CH",
      "title": "Switzerland",
      "image": {
        "url": "https://cdn.airalo.com/images/ch.png"
      },
      "operators": [
        {
          "id": 27,
          "title": "Alpine Signal",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ch-7days-1gb",
              "type": "sim",
              "price": 7.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ch-15days-3gb",
              "type": "sim",
              "price": 13.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ch-30days-5gb",
              "type": "sim",
              "price": 20.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ch-30days-10gb",
              "type": "sim",
              "price": 32.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "austria",
      "country_code": "AT",
      "title": "Austria",
      "image": {
        "url": "https://cdn.airalo.com/images/at.png"
      },
      "operators": [
        {
          "id": 28,
          "title": "Danube Data",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "at-7days-1gb",
              "type": "sim",
              "price": 5.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "at-15days-3gb",
              "type": "sim",
              "price": 10.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "at-30days-5gb",
              "type": "sim",
              "price": 16.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "at-30days-10gb",
              "type": "sim",
              "price": 25.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "greece",
      "country_code": "GR",
      "title": "Greece",
      "image": {
        "url": "https://cdn.airalo.com/images/gr.png"
      },
      "operators": [
        {
          "id": 29,
          "title": "Aegean Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "gr-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "gr-15days-3gb",
              "type": "sim",
              "price": 9.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "gr-30days-5gb",
              "type": "sim",
              "price": 14.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "gr-30days-10gb",
              "type": "sim",
              "price": 23.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "ireland",
      "country_code": "IE",
      "title": "Ireland",
      "image": {
        "url": "https://cdn.airalo.com/images/ie.png"
      },
      "operators": [
        {
          "id": 30,
          "title": "Shamrock Net",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ie-7days-1gb",
              "type": "sim",
              "price": 5.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ie-15days-3gb",
              "type": "sim",
              "price": 10.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ie-30days-5gb",
              "type": "sim",
              "price": 16.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ie-30days-10gb",
              "type": "sim",
              "price": 25.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "poland",
      "country_code": "PL",
      "title": "Poland",
      "image": {
        "url": "https://cdn.airalo.com/images/pl.png"
      },
      "operators": [
        {
          "id": 31,
          "title": "Vistula Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "pl-7days-1gb",
              "type": "sim",
              "price": 4.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "pl-15days-3gb",
              "type": "sim",
              "price": 8.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "pl-30days-5gb",
              "type": "sim",
              "price": 13.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "pl-30days-10gb",
              "type": "sim",
              "price": 20.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "czechia",
      "country_code": "CZ",
      "title": "Czechia",
      "image": {
        "url": "https://cdn.airalo.com/images/cz.png"
      },
      "operators": [
        {
          "id": 32,
          "title": "Bohemia Link",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "cz-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "cz-15days-3gb",
              "type": "sim",
              "price": 9.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "cz-30days-5gb",
              "type": "sim",
              "price": 14.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "cz-30days-10gb",
              "type": "sim",
              "price": 22.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "united-states",
      "country_code": "US",
      "title": "United States",
      "image": {
        "url": "https://cdn.airalo.com/images/us.png"
      },
      "operators": [
        {
          "id": 33,
          "title": "StarConnect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "us-7days-1gb",
              "type": "sim",
              "price": 6.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "us-15days-3gb",
              "type": "sim",
              "price": 12.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "us-30days-5gb",
              "type": "sim",
              "price": 19.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "us-30days-10gb",
              "type": "sim",
              "price": 30.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "us-30days-unlimited",
              "type": "sim",
              "price": 47.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "canada",
      "country_code": "CA",
      "title": "Canada",
      "image": {
        "url": "https://cdn.airalo.com/images/ca.png"
      },
      "operators": [
        {
          "id": 34,
          "title": "Maple Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ca-7days-1gb",
              "type": "sim",
              "price": 6.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ca-15days-3gb",
              "type": "sim",
              "price": 12.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ca-30days-5gb",
              "type": "sim",
              "price": 19.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ca-30days-10gb",
              "type": "sim",
              "price": 30.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "ca-30days-unlimited",
              "type": "sim",
              "price": 47.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "mexico",
      "country_code": "MX",
      "title": "Mexico",
      "image": {
        "url": "https://cdn.airalo.com/images/mx.png"
      },
      "operators": [
        {
          "id": 35,
          "title": "Azteca Net",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "mx-7days-1gb",
              "type": "sim",
              "price": 4.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "mx-15days-3gb",
              "type": "sim",
              "price": 8.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "mx-30days-5gb",
              "type": "sim",
              "price": 13.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "mx-30days-10gb",
              "type": "sim",
              "price": 20.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "brazil",
      "country_code": "BR",
      "title": "Brazil",
      "image": {
        "url": "https://cdn.airalo.com/images/br.png"
      },
      "operators": [
        {
          "id": 36,
          "title": "Samba Signal",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "br-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "br-15days-3gb",
              "type": "sim",
              "price": 9.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "br-30days-5gb",
              "type": "sim",
              "price": 14.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "br-30days-10gb",
              "type": "sim",
              "price": 22.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "australia",
      "country_code": "AU",
      "title": "Australia",
      "image": {
        "url": "https://cdn.airalo.com/images/au.png"
      },
      "operators": [
        {
          "id": 37,
          "title": "OzConnect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "au-7days-1gb",
              "type": "sim",
              "price": 6.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "au-15days-3gb",
              "type": "sim",
              "price": 11.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "au-30days-5gb",
              "type": "sim",
              "price": 17.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "au-30days-10gb",
              "type": "sim",
              "price": 27.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            },
            {
              "id": "au-30days-unlimited",
              "type": "sim",
              "price": 43.0,
              "amount": 0,
              "day": 30,
              "is_unlimited": true,
              "title": "Unlimited - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "new-zealand",
      "country_code": "NZ",
      "title": "New Zealand",
      "image": {
        "url": "https://cdn.airalo.com/images/nz.png"
      },
      "operators": [
        {
          "id": 38,
          "title": "Kiwi Connect",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "nz-7days-1gb",
              "type": "sim",
              "price": 6.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "nz-15days-3gb",
              "type": "sim",
              "price": 11.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "nz-30days-5gb",
              "type": "sim",
              "price": 17.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "nz-30days-10gb",
              "type": "sim",
              "price": 27.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "egypt",
      "country_code": "EG",
      "title": "Egypt",
      "image": {
        "url": "https://cdn.airalo.com/images/eg.png"
      },
      "operators": [
        {
          "id": 39,
          "title": "Nile Net",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "eg-7days-1gb",
              "type": "sim",
              "price": 4.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "eg-15days-3gb",
              "type": "sim",
              "price": 8.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "eg-30days-5gb",
              "type": "sim",
              "price": 12.5,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "eg-30days-10gb",
              "type": "sim",
              "price": 19.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "south-africa",
      "country_code": "ZA",
      "title": "South Africa",
      "image": {
        "url": "https://cdn.airalo.com/images/za.png"
      },
      "operators": [
        {
          "id": 40,
          "title": "Savanna Cell",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "za-7days-1gb",
              "type": "sim",
              "price": 5.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "za-15days-3gb",
              "type": "sim",
              "price": 9.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "za-30days-5gb",
              "type": "sim",
              "price": 14.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "za-30days-10gb",
              "type": "sim",
              "price": 22.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "morocco",
      "country_code": "MA",
      "title": "Morocco",
      "image": {
        "url": "https://cdn.airalo.com/images/ma.png"
      },
      "operators": [
        {
          "id": 41,
          "title": "Atlas Mobile",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ma-7days-1gb",
              "type": "sim",
              "price": 4.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ma-15days-3gb",
              "type": "sim",
              "price": 8.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ma-30days-5gb",
              "type": "sim",
              "price": 13.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ma-30days-10gb",
              "type": "sim",
              "price": 20.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "kenya",
      "country_code": "KE",
      "title": "Kenya",
      "image": {
        "url": "https://cdn.airalo.com/images/ke.png"
      },
      "operators": [
        {
          "id": 42,
          "title": "Safari Signal",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "ke-7days-1gb",
              "type": "sim",
              "price": 4.5,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "ke-15days-3gb",
              "type": "sim",
              "price": 8.5,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "ke-30days-5gb",
              "type": "sim",
              "price": 13.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "ke-30days-10gb",
              "type": "sim",
              "price": 20.5,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "asia-regional-14-countries",
      "country_code": "ASIA",
      "title": "Asia (Regional — 14 countries)",
      "image": {
        "url": "https://cdn.airalo.com/images/asia.png"
      },
      "operators": [
        {
          "id": 43,
          "title": "PanAsia Roam",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "asia-15days-3gb",
              "type": "sim",
              "price": 16.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "asia-30days-5gb",
              "type": "sim",
              "price": 24.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "asia-30days-10gb",
              "type": "sim",
              "price": 39.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "europe-regional-30-countries",
      "country_code": "EURO",
      "title": "Europe (Regional — 30 countries)",
      "image": {
        "url": "https://cdn.airalo.com/images/euro.png"
      },
      "operators": [
        {
          "id": 44,
          "title": "EuroLink Roam",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "euro-15days-3gb",
              "type": "sim",
              "price": 17.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "euro-30days-5gb",
              "type": "sim",
              "price": 26.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            },
            {
              "id": "euro-30days-10gb",
              "type": "sim",
              "price": 42.0,
              "amount": 10240,
              "day": 30,
              "is_unlimited": false,
              "title": "10 GB - 30 Days"
            }
          ]
        }
      ]
    },
    {
      "slug": "global-120-countries",
      "country_code": "GLOBAL",
      "title": "Global (120+ countries)",
      "image": {
        "url": "https://cdn.airalo.com/images/global.png"
      },
      "operators": [
        {
          "id": 45,
          "title": "Orbit Global",
          "type": "local",
          "plan_type": "data",
          "packages": [
            {
              "id": "global-7days-1gb",
              "type": "sim",
              "price": 12.0,
              "amount": 1024,
              "day": 7,
              "is_unlimited": false,
              "title": "1 GB - 7 Days"
            },
            {
              "id": "global-15days-3gb",
              "type": "sim",
              "price": 24.0,
              "amount": 3072,
              "day": 15,
              "is_unlimited": false,
              "title": "3 GB - 15 Days"
            },
            {
              "id": "global-30days-5gb",
              "type": "sim",
              "price": 36.0,
              "amount": 5120,
              "day": 30,
              "is_unlimited": false,
              "title": "5 GB - 30 Days"
            }
          ]
        }
      ]
    }
  ],
  "meta": {
    "message": "success"
  }
};

function generateMockIccid() {
  return "89" + Array.from({ length: 17 }, () => Math.floor(Math.random() * 10)).join("");
}
__name(generateMockIccid, "generateMockIccid");
function generateMockQrCode(iccid) {
  return `LPA:1$sandbox.airalo.com$${iccid}`;
}
__name(generateMockQrCode, "generateMockQrCode");
function generateMockQrUrl(iccid) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=LPA:1%24sandbox.airalo.com%24${iccid}`;
}
__name(generateMockQrUrl, "generateMockQrUrl");

function orderConfirmationEmail(order, userEmail) {
  const { package_title, country, validity, data_amount, iccid, qr_code, qr_url, order_code, price } = order;
  return {
    from: "Juzgo <hello@juzgo.world>",
    to: userEmail,
    subject: `Your eSIM is ready \u2014 ${country} \xB7 ${package_title}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F8F6;font-family:'Hanken Grotesk',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;color:#16271E;">

    <!-- Header -->
    <div style="background:#1E8E5E;padding:32px 40px;text-align:center;">
      <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.01em;">Juzgo</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Your eSIM is ready to install</p>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <h2 style="margin:0 0 8px;font-size:22px;color:#16271E;">\u{1F389} Your eSIM is ready</h2>
      <p style="color:#5B6B62;margin:0 0 32px;">Order <strong style="color:#1E8E5E;">${order_code}</strong> is confirmed.</p>

      <!-- Plan Details -->
      <div style="background:#F4F8F6;border:1px solid #E2E9E5;border-radius:16px;padding:24px;margin-bottom:24px;">
        <h3 style="margin:0 0 16px;font-size:13px;color:#1E8E5E;text-transform:uppercase;letter-spacing:1px;">Plan details</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#5B6B62;font-size:14px;">Destination</td><td style="padding:8px 0;font-weight:700;text-align:right;">${country}</td></tr>
          <tr><td style="padding:8px 0;color:#5B6B62;font-size:14px;">Plan</td><td style="padding:8px 0;font-weight:700;text-align:right;">${package_title}</td></tr>
          <tr><td style="padding:8px 0;color:#5B6B62;font-size:14px;">Data</td><td style="padding:8px 0;font-weight:700;text-align:right;">${data_amount}</td></tr>
          <tr><td style="padding:8px 0;color:#5B6B62;font-size:14px;">Validity</td><td style="padding:8px 0;font-weight:700;text-align:right;">${validity} days</td></tr>
          <tr><td style="padding:8px 0;color:#5B6B62;font-size:14px;">Price</td><td style="padding:8px 0;font-weight:700;text-align:right;color:#1E8E5E;">SGD ${price}</td></tr>
          <tr><td style="padding:8px 0;color:#5B6B62;font-size:14px;">ICCID</td><td style="padding:8px 0;font-size:12px;text-align:right;font-family:'DM Mono',monospace;">${iccid}</td></tr>
        </table>
      </div>

      <!-- QR Code -->
      <div style="background:#EEF5FF;border:1px solid #D3E3FB;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
        <h3 style="margin:0 0 8px;font-size:16px;color:#2A6FDB;">Scan to install</h3>
        <p style="color:#5B6B62;font-size:13px;margin:0 0 16px;">Use your phone's camera to scan this QR code</p>
        <img src="${qr_url}" alt="eSIM QR Code" style="width:180px;height:180px;background:#fff;padding:12px;border-radius:12px;border:1px solid #E2E9E5;">
        <p style="color:#9AA89F;font-size:11px;margin:12px 0 0;font-family:'DM Mono',monospace;">${qr_code}</p>
      </div>

      <!-- Installation Steps -->
      <div style="background:#F4F8F6;border:1px solid #E2E9E5;border-radius:16px;padding:24px;margin-bottom:24px;">
        <h3 style="margin:0 0 16px;font-size:16px;color:#16271E;">\u{1F4F1} How to install</h3>
        <ol style="margin:0;padding-left:20px;color:#5B6B62;font-size:14px;line-height:2;">
          <li>Go to <strong style="color:#16271E;">Settings \u2192 Mobile/Cellular \u2192 Add eSIM</strong></li>
          <li>Tap <strong style="color:#16271E;">Use QR Code</strong> and scan the code above</li>
          <li>Follow the on-screen steps to activate</li>
          <li>Turn on <strong style="color:#16271E;">Data Roaming</strong> when you arrive</li>
        </ol>
      </div>

      <!-- Register Nudge -->
      <div style="background:#F1F6F3;border:1px solid #D8E8DF;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
        <div style="font-size:28px;margin-bottom:8px;">\u{1F510}</div>
        <h3 style="margin:0 0 8px;font-size:16px;color:#16271E;">Keep your eSIM safe</h3>
        <p style="color:#5B6B62;font-size:13px;margin:0 0 16px;line-height:1.6;">
          Create a free account to re-download your QR codes anytime, track your orders, and plan trips with the AI itinerary planner.
        </p>
        <a href="https://juzgo.world/register" style="display:inline-block;background:#1E8E5E;color:#FFFFFF;font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px;text-decoration:none;">
          Create free account \u2192
        </a>
        <p style="color:#9AA89F;font-size:12px;margin:12px 0 0;">
          Already have an account? <a href="https://juzgo.world/login" style="color:#1E8E5E;">Sign in</a>
        </p>
      </div>

      <!-- Find My Order -->
      <div style="background:#FFFFFF;border:1px solid #E2E9E5;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
        <p style="color:#5B6B62;font-size:13px;margin:0;">
          \u{1F4E7} Lost access to this email? <a href="https://juzgo.world/find-order" style="color:#1E8E5E;">Find your order</a>
        </p>
      </div>

      <!-- Support -->
      <p style="color:#5B6B62;font-size:13px;text-align:center;">
        Need help? Contact <a href="mailto:hello@juzgo.world" style="color:#1E8E5E;">hello@juzgo.world</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;border-top:1px solid #E2E9E5;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9AA89F;">\xA9 2026 Kairos Ventures Pte. Ltd. \xB7 Singapore</p>
      <p style="margin:4px 0 0;font-size:12px;color:#9AA89F;">
        <a href="https://juzgo.world/terms" style="color:#9AA89F;">Terms &amp; Conditions</a> \xB7
        <a href="https://juzgo.world" style="color:#9AA89F;">juzgo.world</a>
      </p>
    </div>

  </div>
</body>
</html>`
  };
}
__name(orderConfirmationEmail, "orderConfirmationEmail");

async function sendEmail(emailData, resendApiKey) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(emailData)
  });
  return response.json();
}
__name(sendEmail, "sendEmail");

var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/check-guest" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const key = "guest:" + ip;
      const body = await request.json().catch(() => ({}));
      const increment = body.increment === true;
      let record = null;
      try {
        record = await env.GUEST_RATE_LIMIT.get(key, { type: "json" });
      } catch (e) {
      }
      const now = Date.now();
      const windowMs = 24 * 60 * 60 * 1e3;
      const withinWindow = record && now - record.firstSeen < windowMs;
      const count = withinWindow ? record.count : 0;
      if (count >= 2) {
        return new Response(JSON.stringify({ allowed: false, reason: "rate_limited", count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (increment) {
        const newRecord = { count: count + 1, firstSeen: withinWindow ? record.firstSeen : now };
        await env.GUEST_RATE_LIMIT.put(key, JSON.stringify(newRecord), { expirationTtl: 86400 });
        return new Response(JSON.stringify({ allowed: true, count: newRecord.count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ allowed: true, count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/" || path === "") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      try {
        const body = await request.json();
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (path === "/airalo/token" && request.method === "POST") {
      return new Response(JSON.stringify({
        data: {
          token_type: "Bearer",
          expires_in: 86400,
          access_token: "mock_token_" + Date.now()
        },
        meta: { message: "success" }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (path === "/airalo/packages" && request.method === "GET") {
      const countryCode = url.searchParams.get("country");
      let packages = MOCK_PACKAGES;
      if (countryCode) {
        packages = {
          ...MOCK_PACKAGES,
          data: MOCK_PACKAGES.data.filter(
            (p) => p.country_code.toLowerCase() === countryCode.toLowerCase()
          )
        };
      }
      return new Response(JSON.stringify(packages), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/airalo/orders" && request.method === "POST") {
      try {
        const body = await request.json();
        const { package_id, user_email, user_name } = body;
        let foundPackage = null;
        let foundCountry = null;
        let foundOperator = null;
        for (const country of MOCK_PACKAGES.data) {
          for (const operator of country.operators) {
            const pkg = operator.packages.find((p) => p.id === package_id);
            if (pkg) {
              foundPackage = pkg;
              foundCountry = country;
              foundOperator = operator;
              break;
            }
          }
          if (foundPackage) break;
        }
        if (!foundPackage) {
          return new Response(JSON.stringify({ error: "Package not found" }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const iccid = generateMockIccid();
        const qrCode = generateMockQrCode(iccid);
        const qrUrl = generateMockQrUrl(iccid);
        const orderCode = "JZ-" + Date.now().toString().slice(-8);
        const orderData = {
          id: Math.floor(Math.random() * 9e4) + 1e4,
          code: orderCode,
          package_id,
          package_title: foundPackage.title,
          country: foundCountry.title,
          country_code: foundCountry.country_code,
          validity: foundPackage.day,
          data_amount: foundPackage.is_unlimited ? "Unlimited" : foundPackage.amount / 1024 + " GB",
          price: Number(foundPackage.price).toFixed(2),
          // Mock prices are already SGD — no currency conversion applied.
          currency: "SGD",
          iccid,
          qr_code: qrCode,
          qr_url: qrUrl,
          order_code: orderCode,
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          sims: [{
            id: Math.floor(Math.random() * 9e4),
            iccid,
            qrcode: qrCode,
            qrcode_url: qrUrl,
            lpa: "sandbox.airalo.com",
            matching_id: iccid.slice(-8)
          }]
        };
        if (user_email && env.RESEND_API_KEY) {
          const emailData = orderConfirmationEmail(orderData, user_email);
          await sendEmail(emailData, env.RESEND_API_KEY);
        }
        return new Response(JSON.stringify({
          data: orderData,
          meta: { message: "success" }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (path === "/send-email" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await sendEmail(body, env.RESEND_API_KEY);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  // Supabase keep-alive: pings the countries table every 3 days
  // Prevents 7-day inactivity pause on Supabase free tier
  // Cron trigger registered separately: "0 9 */3 * *"
  async scheduled(event, env, ctx) {
    const url = `${env.SUPABASE_URL}/rest/v1/countries?select=id&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
      }
    });
    console.log(`keepalive ${res.status} @ ${new Date().toISOString()}`);
  }
};
export {
  index_default as default
};
