# UCI Online Retail II Dataset Attribution & Provenance

## Dataset Metadata
- **Dataset Name:** Online Retail II
- **Repository:** UCI Machine Learning Repository
- **DOI:** [10.24432/C5CG6D](https://doi.org/10.24432/C5CG6D)
- **Direct Source URL:** https://archive.ics.uci.edu/dataset/502/online+retail+ii
- **Date Donated:** 2019-09-21
- **Year Created:** 2012
- **Donor / Primary Investigator:** Dr. Daqing Chen
- **Institution:** School of Engineering, London South Bank University, London SE1 0AA, UK
- **File Format:** Microsoft Excel (`online_retail_II.xlsx`) & ZIP Archive (`online_retail_ii.zip`)
- **Total Instances:** 1,067,371 records
- **Timeframe:** 01/12/2009 to 09/12/2011

## Formal Citation (APA)
> Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D.

## Formal Citation (BibTeX)
```bibtex
@misc{online_retail_ii_502,
  author       = {Chen, Daqing},
  title        = {{Online Retail II}},
  year         = {2012},
  howpublished = {UCI Machine Learning Repository},
  note         = {{DOI}: https://doi.org/10.24432/C5CG6D}
}
```

## Schema & Variables
1. **Invoice**: Invoice number (6-digit integral number). If the code starts with letter 'C', it indicates a cancellation or return.
2. **StockCode**: Product (item) code (5-digit integral or alphanumeric identifier).
3. **Description**: Product (item) name. Nominal text.
4. **Quantity**: The quantities of each product per transaction (Numeric). Negative quantities correspond to cancellations or stock adjustments.
5. **InvoiceDate**: The day and time when each transaction was generated.
6. **Price**: Unit price in sterling pounds (£) per unit.
7. **Customer ID**: 5-digit integral number uniquely assigned to each customer. (Masked in public User Portal for privacy compliance).
8. **Country**: The name of the country where each customer resides.

## Provenance & Data Separation Policy
- This dataset is classified as **REAL DATA**.
- It is stored strictly separately from Madam Hex's fictional potion and magical ingredient data.
- It does not manufacture ingredient inventories or lead times.
- Fictional simulation parameters are kept distinct from actual retail records.

