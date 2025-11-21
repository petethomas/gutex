# Gutex

Navigate and excerpt [Project Gutenberg](https://gutenberg.org/) [eBooks](https://gutenberg.org/ebooks/).

## Tests

```npm run test```

## Usage

```bash
./gutex [--snapshot] [--raw] <bookId> <chunkSize> <startPercent>

# Examples:
./gutex 996 7 36              # Don Quixote, 7 words, start at 36%
./gutex --snapshot 996 7 36   # Print text and exit (no REPL)
./gutex --raw 996 7 36   # REPL without metadata display
./gutex --lookup "Lincoln"   # REPL without metadata display
```

## Navigate with keys

- **Forward**: ↑ → w d
- **Backward**: ↓ ← s a  
- **Quit**: q Esc

## Find an eBook & excerpt it

```
./gutex --lookup "Marcus A"
Found 7 results for: "Marcus A"

    --> [6920] "Thoughts of Marcus Aurelius"
    --> [7525] "The History of Roman Literature From the Earliest Period to the Death of Marcus Aurelius"
    --> [15877] "Thoughts of Marcus Aurelius Antoninus"
    --> [34122] "Roman Society from Nero to Marcus Aurelius"
    --> [42865] "English Conferences of Ernest Renan: Rome and Christianity. Marcus Aurelius"
    --> [55317] "The Meditations of the Emperor Marcus Aurelius Antoninus A new rendering based on the Foulis translation of 1742"
    --> [59784] "Index of the Project Gutenberg Works of Marcus Aurelius Antoninus"

./gutex --snapshot 6920 36 75
set seats in the shade for strangers, but themselves sat down anywhere. 25. Socrates excused himself to Perdiccas for not going to him, saying, It is because I would not perish by the worst of all`
```

```
bash-3.2$ ./gutex --lookup "Dracula"
Found 5 results for: "Dracula"

    --> [345] "Dracula"
    --> [6534] "Dracula"
    --> [10150] "Dracula's Guest"
    --> [19797] "Dracula"
    --> [45839] "Dracula"

bash-3.2$ ./gutex --snapshot 345 15 10
them that made me uneasy, some longing and at the same time some deadly fear.
```

## Debug Mode

```bash
DEBUG=1 node gutex 996 7 36  # Shows per-request HTTP details
```
