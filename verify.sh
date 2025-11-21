#!/bin/bash
# Quick verification that gutex 1.2.0 works

echo "Testing gutex 1.2.0..."
echo ""

# Test 1: Error handling
echo -n "1. Error handling: "
./gutex > /dev/null 2>&1
if [ $? -eq 1 ]; then
  echo "✓"
else
  echo "✗ (exit code wrong)"
  exit 1
fi

# Test 2: Lookup (if catalog exists)
if [ -f .cache/pg_catalog.csv ]; then
  echo -n "2. Lookup: "
  OUTPUT=$(./gutex --lookup "test" 2>&1)
  if [ $? -eq 0 ]; then
    echo "✓"
  else
    echo "✗"
    exit 1
  fi
fi

# Test 3: Tests pass
echo -n "3. Test suite: "
TEST_OUTPUT=$(npm test 2>&1)
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep "# pass" | awk '{print $3}')
if [ "$PASS_COUNT" -ge "90" ]; then
  echo "✓ ($PASS_COUNT tests pass)"
else
  echo "✗ (only $PASS_COUNT pass)"
  exit 1
fi

echo ""
echo "All checks passed!"
echo ""
echo "Try: ./gutex --lookup \"alice\""
echo "Then: ./gutex <bookId> 10 0"
