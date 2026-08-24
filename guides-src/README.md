# Guide source and validation

The public PDF filenames are stable because they are linked from the guide-download flow:

- `sma-buyers-guide.pdf`
- `sma-sellers-playbook.pdf`
- `sma-moving-guide.pdf`

## Edit

Edit the guide copy in `build_guides.py`. Brand contact details are defined once at the top of the file and must remain consistent with the verified public site.

## Regenerate

Install the small build dependency, then run the project command from the repository root:

```bash
python3 -m pip install -r guides-src/requirements.txt
npm run guides:build
```

## Validate

```bash
npm run guides:validate
```

The validator checks the three stable public filenames, PDF metadata, text extraction, clickable CTA links, and page count. For visual QA, render all pages and inspect the PNGs:

```bash
mkdir -p tmp/guides-render
pdftoppm -png -r 144 public/guides/sma-buyers-guide.pdf tmp/guides-render/buyer
pdftoppm -png -r 144 public/guides/sma-sellers-playbook.pdf tmp/guides-render/seller
pdftoppm -png -r 144 public/guides/sma-moving-guide.pdf tmp/guides-render/moving
```

The guides intentionally avoid property imagery, sales results, market statistics, and prescriptive legal, finance, tax, immigration, residency, healthcare, banking, or notarial guidance. Have the owner or qualified local professionals review any future copy that introduces factual or specialist claims.
