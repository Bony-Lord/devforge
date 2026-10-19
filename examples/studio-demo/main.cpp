#include <algorithm>
#include <iostream>
#include "analytics.hpp"

static int unused_helper(int unused_parameter) { return 0; }

int main() {
    std::vector<int> values{8, 3, 5, 1, 9};
    int unused_variable = 42;
    std::sort(values.begin(), values.end());
    const auto total = sum(values);

    for (const auto value : values) {
        std::cout << value << ' ';
    }
    std::cout << "\nsum = " << total << '\n';
    return 0;
}
