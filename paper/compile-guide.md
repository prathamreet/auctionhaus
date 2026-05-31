### Step 1: Install LaTeX (pdflatex) on Windows

The standard, modern command-line way to install LaTeX on Windows is using the built-in Windows Package Manager (`winget`):

```powershell
winget install MiKTeX.MiKTeX
```

*(Alternatively, you can download and run the graphical installer directly from the [MiKTeX Official Website](https://miktex.org/download)).*

> **Important:** Once the installation finishes, you **must close and restart your terminal window** so that `pdflatex` is added to your environment's PATH.

---

### Step 2: Commands to Compile the Documents

Navigate to the `paper` directory:
```powershell
cd paper
```

Run these sequences of commands in your terminal to compile the PDFs. Running `pdflatex` followed by `bibtex` and then `pdflatex` twice is the standard academic sequence to resolve all bibliography citations and table references perfectly.

#### Compile the Shill-Bidding Fraud Paper (`main.tex`)
```powershell
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

#### Compile the Atomic Ladder Concurrency Paper (`auto-bid-ladder.tex`)
```powershell
pdflatex auto-bid-ladder.tex
bibtex auto-bid-ladder
pdflatex auto-bid-ladder.tex
pdflatex auto-bid-ladder.tex
```

#### Compile the Project Poster (`poster.tex`)
```powershell
pdflatex poster.tex
```

---

### Tips for compiling:
*   When compiling for the first time, MiKTeX might pop up a small dialog asking to download required LaTeX packages (such as `booktabs`, `pgfplots`, or `tikzposter`). Click **Install** to let it automatically download and integrate them.