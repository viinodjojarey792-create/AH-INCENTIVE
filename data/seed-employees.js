// Seed employee roster — used to populate the Employees list on first run
// and via "Reset employees to seed" in Settings. Edit this array to update
// the baseline roster; live data lives in Supabase once the app runs.
export const SEED_EMPLOYEES = [
  {
    "id": "e1",
    "srNo": 1,
    "nameHR": "Vipin Sudhakar Kulkarni",
    "gender": "Male",
    "doj": "01/04/2017",
    "department": "HOUSE KEEPING",
    "designation": "Office Boy",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Vipin Sudhakar Kulkarni"
    ],
    "supervisorId": null
  },
  {
    "id": "e2",
    "srNo": 2,
    "nameHR": "Shaikh Feroz Mo. Sharif Shaikh",
    "gender": "Male",
    "doj": "22/03/2017",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 109098.0,
    "hiriseAliases": [
      "FEROZ SHAIKH",
      "Shaikh Feroz Mo. Sharif Shaikh"
    ],
    "supervisorId": "e23"
  },
  {
    "id": "e3",
    "srNo": 3,
    "nameHR": "Ashok Ramchandra Pardeshi",
    "gender": "Male",
    "doj": "22/03/2017",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 205030.0,
    "hiriseAliases": [
      "ASHOK PARDESHI(HEAD)",
      "Ashok Ramchandra Pardeshi"
    ],
    "supervisorId": "e32"
  },
  {
    "id": "e4",
    "srNo": 4,
    "nameHR": "Sandeep Sahebrao Kale",
    "gender": "Male",
    "doj": "01/04/2017",
    "department": "BILLING",
    "designation": "Cashier",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Sandeep Sahebrao Kale"
    ],
    "supervisorId": null
  },
  {
    "id": "e5",
    "srNo": 5,
    "nameHR": "Mukesh Balram Gundle",
    "gender": "Male",
    "doj": "01/04/2017",
    "department": "MANAGER",
    "designation": "Service Manager",
    "status": "ACTIVE",
    "category": "WM",
    "target": 3900000,
    "targetNote": "Floor LOP + Bodyshop LOP + Spare Counter (OTC) + Standard Part Sales + Counter Lube Sale",
    "hiriseAliases": [
      "Mukesh Balram Gundle"
    ],
    "supervisorId": null
  },
  {
    "id": "e6",
    "srNo": 6,
    "nameHR": "Syed Sheru Syed Murad",
    "gender": "Male",
    "doj": "12/06/2017",
    "department": "FLOOR TECHNICIAN",
    "designation": "Sr. Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 125000.0,
    "hiriseAliases": [
      "SYED SHERU SYED MURAD",
      "Syed Sheru Syed Murad"
    ],
    "supervisorId": "e10"
  },
  {
    "id": "e7",
    "srNo": 7,
    "nameHR": "Khandu Baban Katare",
    "gender": "Male",
    "doj": "22/06/2017",
    "department": "FRONT LINE ADVISOR",
    "designation": "Service Advisor",
    "status": "ACTIVE",
    "category": "ADVISOR",
    "target": 707688.53,
    "hiriseAliases": [
      "Khandu Baban Katare"
    ],
    "supervisorId": null
  },
  {
    "id": "e8",
    "srNo": 8,
    "nameHR": "Vishnu Manikrao Salunke",
    "gender": "Male",
    "doj": "01/04/2017",
    "department": "HOUSE KEEPING",
    "designation": "Office Boy",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Vishnu Manikrao Salunke"
    ],
    "supervisorId": null
  },
  {
    "id": "e9",
    "srNo": 9,
    "nameHR": "Vishal Jagnnath Aher",
    "gender": "Male",
    "doj": "01/03/2018",
    "department": "FRONT LINE ADVISOR",
    "designation": "Service Advisor",
    "status": "ACTIVE",
    "category": "ADVISOR",
    "target": 812273.85,
    "hiriseAliases": [
      "Vishal Jagnnath Aher"
    ],
    "supervisorId": null
  },
  {
    "id": "e10",
    "srNo": 10,
    "nameHR": "Rajesh Padmakarrao Taur",
    "gender": "Male",
    "doj": "20/02/2018",
    "department": "FLOOR SUPERVISOR",
    "designation": "Floor Supervisor",
    "status": "ACTIVE",
    "category": "SUPERVISOR",
    "target": 0,
    "hiriseAliases": [
      "Rajesh Padmakarrao Taur"
    ],
    "supervisorId": null
  },
  {
    "id": "e11",
    "srNo": 11,
    "nameHR": "Vijay Mate",
    "gender": "Male",
    "doj": "16/11/2019",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 125000,
    "hiriseAliases": [
      "Vijay Mate"
    ],
    "supervisorId": null
  },
  {
    "id": "e12",
    "srNo": 12,
    "nameHR": "Shaikh Tausif Shaikh Rafique",
    "gender": "Male",
    "doj": "14/10/2020",
    "department": "WARRANTY",
    "designation": "Warranty Incharge",
    "status": "ACTIVE",
    "category": "WARRANTY",
    "target": 0,
    "hiriseAliases": [
      "Shaikh Tausif Shaikh Rafique"
    ],
    "supervisorId": null
  },
  {
    "id": "e13",
    "srNo": 13,
    "nameHR": "Poonam Rameshwar Sharma",
    "gender": "Female",
    "doj": "20/05/2019",
    "department": "CUSTOMER RELATION",
    "designation": "CRE Incharge",
    "status": "RESIGNED",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Poonam Rameshwar Sharma"
    ],
    "supervisorId": null
  },
  {
    "id": "e14",
    "srNo": 14,
    "nameHR": "Nisar Shbbir Shaikh",
    "gender": "Male",
    "doj": "16/12/2019",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 160490.0,
    "hiriseAliases": [
      "NISAR SHABBIR SHAIKH",
      "Nisar Shbbir Shaikh"
    ],
    "supervisorId": "e10"
  },
  {
    "id": "e15",
    "srNo": 15,
    "nameHR": "Chetan Suresh Tupshendre",
    "gender": "Male",
    "doj": "24/03/2017",
    "department": "SPARES",
    "designation": "Store Manager",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Chetan Suresh Tupshendre"
    ],
    "supervisorId": null
  },
  {
    "id": "e16",
    "srNo": 16,
    "nameHR": "feroz Khaled khan",
    "gender": "Male",
    "doj": "18/11/2021",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 67726.0,
    "hiriseAliases": [
      "FEROZ KHAN",
      "feroz Khaled khan"
    ],
    "supervisorId": "e32"
  },
  {
    "id": "e17",
    "srNo": 17,
    "nameHR": "Manda Madhav Hiwale",
    "gender": "Female",
    "doj": "07/12/2021",
    "department": "CUSTOMER RELATION",
    "designation": "CRE Service",
    "status": "RESIGNED",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Manda Madhav Hiwale"
    ],
    "supervisorId": null
  },
  {
    "id": "e18",
    "srNo": 18,
    "nameHR": "Kasim Shaikh Afsar",
    "gender": "Male",
    "doj": "20/04/2017",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 118787.0,
    "hiriseAliases": [
      "KASIM SHAIKH AFSAR",
      "Kasim Shaikh Afsar"
    ],
    "supervisorId": "e10"
  },
  {
    "id": "e19",
    "srNo": 19,
    "nameHR": "Sanjay Narayan Ghusale",
    "gender": "Male",
    "doj": "04/01/2022",
    "department": "SPARES",
    "designation": "Store Assistant",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Sanjay Narayan Ghusale"
    ],
    "supervisorId": null
  },
  {
    "id": "e20",
    "srNo": 20,
    "nameHR": "Prabhakar  Sakharam Bhalerao",
    "gender": "Male",
    "doj": "19/11/2022",
    "department": "BILLING",
    "designation": "Billing Executive",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Prabhakar  Sakharam Bhalerao"
    ],
    "supervisorId": null
  },
  {
    "id": "e21",
    "srNo": 21,
    "nameHR": "Mohammad Abdul rafat Mohammad",
    "gender": "Male",
    "doj": "19/03/2022",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 180365.0,
    "hiriseAliases": [
      "MOH ABDUL RASHID MOHD.ANDUL RA",
      "MUBASHIR PATHAN",
      "Mohammad Abdul rafat Mohammad"
    ],
    "supervisorId": "e32"
  },
  {
    "id": "e22",
    "srNo": 22,
    "nameHR": "Amol Baliram Raut",
    "gender": "Male",
    "doj": "09/05/2022",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 237200.0,
    "hiriseAliases": [
      "AMOL RAUT",
      "Amol Baliram Raut"
    ],
    "supervisorId": "e10"
  },
  {
    "id": "e23",
    "srNo": 23,
    "nameHR": "Indrajit Santram Giri",
    "gender": "Male",
    "doj": "09/03/2023",
    "department": "FRONT LINE SUPERVISOR",
    "designation": "PMS Operator",
    "status": "ACTIVE",
    "category": "SUPERVISOR",
    "target": 0,
    "hiriseAliases": [
      "AMOL RAUT",
      "Indrajit Santram Giri"
    ],
    "supervisorId": null
  },
  {
    "id": "e24",
    "srNo": 24,
    "nameHR": "Deepali Pramod Angre",
    "gender": "Female",
    "doj": "22/08/2023",
    "department": "CUSTOMER RELATION",
    "designation": "CRE Service",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Deepali Pramod Angre"
    ],
    "supervisorId": null
  },
  {
    "id": "e25",
    "srNo": 25,
    "nameHR": "Rajesh Gorakhanath Gaikwad",
    "gender": "Male",
    "doj": "01/12/2023",
    "department": "FLOOR SUPERVISOR",
    "designation": "Floor Supervisor",
    "status": "ACTIVE",
    "category": "SUPERVISOR",
    "target": 0,
    "hiriseAliases": [
      "Rajesh Gorakhanath Gaikwad"
    ],
    "supervisorId": null
  },
  {
    "id": "e26",
    "srNo": 26,
    "nameHR": "Anil Kishor Walunje",
    "gender": "Male",
    "doj": "27/02/2024",
    "department": "SPARES",
    "designation": "Store Assistant",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Indrajit Santram Giri",
      "Anil Kishor Walunje"
    ],
    "supervisorId": null
  },
  {
    "id": "e27",
    "srNo": 27,
    "nameHR": "Bhushan Puranik",
    "gender": "Male",
    "doj": "13/09/2021",
    "department": "SPARES",
    "designation": "Store Executive",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Bhushan Puranik"
    ],
    "supervisorId": null
  },
  {
    "id": "e28",
    "srNo": 28,
    "nameHR": "Fakruddin Quadri Hamiduddin Quadri",
    "gender": "Male",
    "doj": "01/12/2024",
    "department": "BODYSHOP",
    "designation": "Body Shop Painter",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "noIncentive": true,
    "hiriseAliases": [
      "Fakruddin Quadri Hamiduddin Quadri"
    ],
    "supervisorId": null
  },
  {
    "id": "e29",
    "srNo": 29,
    "nameHR": "Saurabha Sanjay Kale",
    "gender": "Male",
    "doj": "03/09/2024",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 176436.0,
    "hiriseAliases": [
      "SAURABH KALE",
      "Saurabha Sanjay Kale"
    ],
    "supervisorId": "e25"
  },
  {
    "id": "e30",
    "srNo": 30,
    "nameHR": "hameed Rashid Sayyed",
    "gender": "Male",
    "doj": "22/06/2017",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 125000,
    "hiriseAliases": [
      "hameed Rashid Sayyed"
    ],
    "supervisorId": null
  },
  {
    "id": "e31",
    "srNo": 31,
    "nameHR": "Monika Pandit",
    "gender": "Female",
    "doj": "20/01/2025",
    "department": "CUSTOMER RELATION",
    "designation": "CRE Service",
    "status": "RESIGNED",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Monika Pandit"
    ],
    "supervisorId": null
  },
  {
    "id": "e32",
    "srNo": 32,
    "nameHR": "Bhagwat Raimohkar",
    "gender": "Male",
    "doj": "04/02/2025",
    "department": "FLOOR SUPERVISOR",
    "designation": "Floor Supervisor",
    "status": "ACTIVE",
    "category": "SUPERVISOR",
    "target": 0,
    "hiriseAliases": [
      "Bhagwat Raimohkar"
    ],
    "supervisorId": null
  },
  {
    "id": "e33",
    "srNo": 33,
    "nameHR": "Deepak Balajirao Bhulekar",
    "gender": "Male",
    "doj": "21/05/2025",
    "department": "PDI",
    "designation": "Front Line Supervisor",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Deepak Balajirao Bhulekar"
    ],
    "supervisorId": null
  },
  {
    "id": "e34",
    "srNo": 34,
    "nameHR": "Shaikh Aadil Shaikh Akbar",
    "gender": "Male",
    "doj": "20/06/2025",
    "department": "BODYSHOP",
    "designation": "Body Shop Executive",
    "status": "ACTIVE",
    "category": "BODYSHOP",
    "target": 0,
    "hiriseAliases": [
      "Shaikh Aadil Shaikh Akbar"
    ],
    "supervisorId": null
  },
  {
    "id": "e35",
    "srNo": 35,
    "nameHR": "Bharat Suradkar",
    "gender": "Male",
    "doj": "26/05/2025",
    "department": "SPARES",
    "designation": "Store Assistant",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Bharat Suradkar"
    ],
    "supervisorId": null
  },
  {
    "id": "e36",
    "srNo": 36,
    "nameHR": "Sagar Wanse",
    "gender": "Male",
    "doj": "01/09/2025",
    "department": "CUSTOMER RELATION",
    "designation": "CRM Service",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Sagar Wanse"
    ],
    "supervisorId": null
  },
  {
    "id": "e37",
    "srNo": 37,
    "nameHR": "Sunil Bharsakhale",
    "gender": "Male",
    "doj": "25/07/2025",
    "department": "WARRANTY",
    "designation": "Warranty Executive",
    "status": "RESIGNED",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Sunil Bharsakhale"
    ],
    "supervisorId": null
  },
  {
    "id": "e38",
    "srNo": 38,
    "nameHR": "Sandeep Narode",
    "gender": "Male",
    "doj": "01/10/2025",
    "department": "FLOOR SUPERVISOR",
    "designation": "Assistant Manager Floor",
    "status": "ACTIVE",
    "category": "NARODE",
    "target": 3000000,
    "targetNote": "Floor LOP + Bodyshop LOP",
    "hiriseAliases": [
      "Sandeep Narode"
    ],
    "supervisorId": null
  },
  {
    "id": "e39",
    "srNo": 39,
    "nameHR": "Pandurang Kurhade",
    "gender": "Male",
    "doj": "27/09/2025",
    "department": "BODYSHOP",
    "designation": "Body Shop Executive",
    "status": "ACTIVE",
    "category": "BODYSHOP",
    "target": 0,
    "hiriseAliases": [
      "Pandurang Kurhade"
    ],
    "supervisorId": null
  },
  {
    "id": "e40",
    "srNo": 40,
    "nameHR": "Utkarsh Mahajan",
    "gender": "Male",
    "doj": "02/05/2025",
    "department": "FRONT LINE ADVISOR",
    "designation": "Service Advisor",
    "status": "RESIGNED",
    "category": "ADVISOR",
    "target": 44950.4,
    "hiriseAliases": [
      "Utkarsh Mahajan"
    ],
    "supervisorId": null
  },
  {
    "id": "e41",
    "srNo": 41,
    "nameHR": "Salman Ajiz Sayyad",
    "gender": "Male",
    "doj": "25/04/2025",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 125000,
    "hiriseAliases": [
      "Salman Ajiz Sayyad"
    ],
    "supervisorId": null
  },
  {
    "id": "e42",
    "srNo": 42,
    "nameHR": "Shaikh Iqlasuddin shaikh Gayasuddin",
    "gender": "Male",
    "doj": "25/06/2021",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 119074.0,
    "hiriseAliases": [
      "Shaikh Shaikh Iqlasuddin shaik",
      "Shaikh Iqlasuddin shaikh Gayasuddin"
    ],
    "supervisorId": "e23"
  },
  {
    "id": "e43",
    "srNo": 43,
    "nameHR": "Syed Tareq Syed Mukhtar",
    "gender": "Male",
    "doj": "24/08/2021",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 101094.0,
    "hiriseAliases": [
      "Syed Syed Tareq Syed Mukhtar",
      "Syed Tareq Syed Mukhtar"
    ],
    "supervisorId": "e23"
  },
  {
    "id": "e44",
    "srNo": 44,
    "nameHR": "Iliyas Beg Farahat Beg",
    "gender": "Male",
    "doj": "19/10/2022",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 129610.0,
    "hiriseAliases": [
      "Beg Iliyas Beg Farahat Beg",
      "Iliyas Beg Farahat Beg"
    ],
    "supervisorId": "e23"
  },
  {
    "id": "e45",
    "srNo": 45,
    "nameHR": "Huzaif Khan Abid Khan",
    "gender": "Male",
    "doj": "27/12/2022",
    "department": "BODYSHOP",
    "designation": "BodyShop Technician",
    "status": "ACTIVE",
    "category": "BODYSHOP",
    "target": 100000,
    "hiriseAliases": [
      "ABID KHAN HUZAIF KHAN",
      "Huzaif Khan Abid Khan"
    ],
    "supervisorId": null
  },
  {
    "id": "e46",
    "srNo": 46,
    "nameHR": "Matin Shabbir Khan",
    "gender": "Male",
    "doj": "01/07/2023",
    "department": "BODYSHOP",
    "designation": "BodyShop Technician",
    "status": "ACTIVE",
    "category": "BODYSHOP",
    "target": 100000,
    "hiriseAliases": [
      "MATIN KHAN",
      "Matin Shabbir Khan"
    ],
    "supervisorId": "e32"
  },
  {
    "id": "e47",
    "srNo": 47,
    "nameHR": "Shaikh majed shaikh Nizamuddin",
    "gender": "Male",
    "doj": "10/06/2024",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "RESIGNED",
    "category": "TECHNICIAN",
    "target": 158264.0,
    "hiriseAliases": [
      "SHAIKH MAJID",
      "RAYYAN BIN SAEEDNBASHMLOL",
      "Shaikh majed shaikh Nizamuddin"
    ],
    "supervisorId": null
  },
  {
    "id": "e48",
    "srNo": 48,
    "nameHR": "Vrushali Gorakhnath Wankhede",
    "gender": "Female",
    "doj": "02/07/2024",
    "department": "CUSTOMER RELATION",
    "designation": "CRE Service",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "SHAIKH MAJED SHAIKH NIZAMUDDIN",
      "Vrushali Gorakhnath Wankhede"
    ],
    "supervisorId": null
  },
  {
    "id": "e49",
    "srNo": 49,
    "nameHR": "Bholeshankar Bhumare",
    "gender": "Male",
    "doj": "12/07/2024",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 119979.0,
    "hiriseAliases": [
      "BHOLESHANKAR BHUMARE",
      "Bholeshankar Bhumare"
    ],
    "supervisorId": "e25"
  },
  {
    "id": "e50",
    "srNo": 50,
    "nameHR": "Afroz Zafar Shaikh",
    "gender": "Male",
    "doj": "05/09/2024",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 169752.0,
    "hiriseAliases": [
      "AFROZ SHAIKH",
      "BHOLESHANKAR BHUMBRE",
      "Afroz Zafar Shaikh"
    ],
    "supervisorId": "e25"
  },
  {
    "id": "e51",
    "srNo": 51,
    "nameHR": "Shravankumar Ingole",
    "gender": "Male",
    "doj": "10/12/2024",
    "department": "FRONT LINE ADVISOR",
    "designation": "Service Advisor",
    "status": "ACTIVE",
    "category": "ADVISOR",
    "target": 641593.84,
    "hiriseAliases": [
      "Shravankumar Ingole"
    ],
    "supervisorId": null
  },
  {
    "id": "e52",
    "srNo": 52,
    "nameHR": "Syed Sohel Syed Aziz",
    "gender": "Male",
    "doj": "02/06/2025",
    "department": "PDI",
    "designation": "PDI Technician",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Shaikh Shaikh Iqlasuddin shaik",
      "Syed Sohel Syed Aziz"
    ],
    "supervisorId": null
  },
  {
    "id": "e53",
    "srNo": 53,
    "nameHR": "Darshan Gargund",
    "gender": "Male",
    "doj": "02/06/2025",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "RESIGNED",
    "category": "TECHNICIAN",
    "target": 125000.0,
    "hiriseAliases": [
      "Darshan Gargund",
      "AFROZ KHAN"
    ],
    "supervisorId": null
  },
  {
    "id": "e54",
    "srNo": 54,
    "nameHR": "Umar Said Chaus",
    "gender": "Male",
    "doj": "01/08/2025",
    "department": "PDI",
    "designation": "PDI Technician",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Umar Said Chaus"
    ],
    "supervisorId": null
  },
  {
    "id": "e55",
    "srNo": 55,
    "nameHR": "Ahmed Adil Yar Khan",
    "gender": "Male",
    "doj": "01/08/2025",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "RESIGNED",
    "category": "TECHNICIAN",
    "target": 125000.0,
    "hiriseAliases": [
      "AHMED KHAN",
      "AAYAN KHAN",
      "Ahmed Adil Yar Khan"
    ],
    "supervisorId": "e25"
  },
  {
    "id": "e56",
    "srNo": 56,
    "nameHR": "Omkar Mutekar",
    "gender": "Male",
    "doj": "10/07/2025",
    "department": "FRONT LINE ADVISOR",
    "designation": "Service Advisor",
    "status": "ACTIVE",
    "category": "ADVISOR",
    "target": 450000.0,
    "hiriseAliases": [
      "Omkar Mutekar","Omkar kamlesh Mutekar","Omkar Kashinath Mutekar",
      "OMKAR MUTEKAR","OMKAR KAMLESH MUTEKAR","OMKAR KASHINATH MUTEKAR",
      "Omkar K Mutekar","OMKAR K MUTEKAR","MH060005SE056","MH060005SENH0101","MH060005SENH0056"
    ],
    "supervisorId": null
  },
  {
    "id": "e57",
    "srNo": 57,
    "nameHR": "Umesh Uttamrao Hiwrale",
    "gender": "Male",
    "doj": "24/03/2017",
    "department": "PDI",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Umesh Uttamrao Hiwrale"
    ],
    "supervisorId": null
  },
  {
    "id": "e58",
    "srNo": 58,
    "nameHR": "Atik Rafiq Mohd",
    "gender": "Male",
    "doj": "06/04/2017",
    "department": "PDI",
    "designation": "Delivery PDI",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Atik Rafiq Mohd"
    ],
    "supervisorId": null
  },
  {
    "id": "e59",
    "srNo": 59,
    "nameHR": "Nagnath Sudhakar Khamkar",
    "gender": "Male",
    "doj": "12/06/2017",
    "department": "ACCESSORIES",
    "designation": "Accesories Manager",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Nagnath Sudhakar Khamkar"
    ],
    "supervisorId": null
  },
  {
    "id": "e60",
    "srNo": 60,
    "nameHR": "Shaharukh Majid Khan",
    "gender": "Male",
    "doj": "01/06/2018",
    "department": "PDI",
    "designation": "PDI Technician",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Shaharukh Majid Khan"
    ],
    "supervisorId": null
  },
  {
    "id": "e61",
    "srNo": 61,
    "nameHR": "Mubarak hamad bamunagga",
    "gender": "Male",
    "doj": "12/12/2022",
    "department": "PDI",
    "designation": "PDI Technician",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Mubarak hamad bamunagga"
    ],
    "supervisorId": null
  },
  {
    "id": "e62",
    "srNo": 62,
    "nameHR": "Syed Tahur Syed Badroddin",
    "gender": "Male",
    "doj": "16/08/2023",
    "department": "PDI",
    "designation": "PDI Technician",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Syed Tahur Syed Badroddin"
    ],
    "supervisorId": null
  },
  {
    "id": "e63",
    "srNo": 63,
    "nameHR": "Subodh Kishor Bankar",
    "gender": "Male",
    "doj": "22/09/2025",
    "department": "PDI",
    "designation": "PDI Helper",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "Subodh Kishor Bankar"
    ],
    "supervisorId": null
  },
  {
    "id": "e64",
    "srNo": 64,
    "nameHR": "AKASH SUBHASH NIKALJE",
    "gender": "Male",
    "doj": "29/11/2025",
    "department": "FRONT LINE ADVISOR",
    "designation": "Service Advisor",
    "status": "ACTIVE",
    "category": "ADVISOR",
    "target": 450000,
    "hiriseAliases": [
      "AKASH SUBHASH NIKALJE",
      "AKASH NIKALJE"
    ],
    "supervisorId": null
  },
  {
    "id": "e65",
    "srNo": 65,
    "nameHR": "SANDEEP BHALERAO",
    "gender": "Male",
    "doj": "08/12/2025",
    "department": "FLOOR TECHNICIAN",
    "designation": "Technician",
    "status": "ACTIVE",
    "category": "TECHNICIAN",
    "target": 125000,
    "hiriseAliases": [
      "SANDEEP BHALERAO","SANDIP BHALERAO","SANDIP LAXMAN BHALERAO",
      "SANDEEP LAXMAN BHALERAO","BALERAO SANDEEP","BHALERAO SANDIP",
      "BHALERAO SANDEEP","MH060005SENH0097","MH060005SENH0121",
      "SANDIP LAXMAN BALERAO","BALERAO SANDIP","SANDEEP BALERAO",
      "SANDIP BALERAO","SANDEEP LAXMAN BALERAO"
    ],
    "supervisorId": null
  },
  {
    "id": "e66",
    "srNo": 66,
    "nameHR": "GAJANAN SHIVAJIRAO KADAM",
    "gender": "Male",
    "doj": "01/04/2026",
    "department": "MANAGER",
    "designation": "Process Auditor",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "GAJANAN SHIVAJIRAO KADAM"
    ],
    "supervisorId": null
  },
  {
    "id": "e67",
    "srNo": 67,
    "nameHR": "SANDEEP LAXMIKANT PARTURKAR",
    "gender": "Male",
    "doj": "07/04/2026",
    "department": "SPARES",
    "designation": "Store Assistant",
    "status": "ACTIVE",
    "category": "NONE",
    "target": 0,
    "hiriseAliases": [
      "SANDEEP LAXMIKANT PARTURKAR"
    ],
    "supervisorId": null
  }
];
