#include "summary.hpp"
#include <fstream>
#include <iostream>
#include <vector>

int main() {
    std::ifstream input("data/input.txt");
    if (!input) {
        std::cerr << "Run from the project root: data/input.txt was not found\n";
        return 1;
    }
    std::vector<int> values;
    for (int value; input >> value;) {
        values.push_back(value);
    }
    std::cout << "C++ Studio: " << sum(values) << '\n';
}
