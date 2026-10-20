#include <iostream>
#include <vector>

int main() {
    std::vector<int> values{3, 5, 8};
    int result = 0;
    for (auto& value : values) {
        auto *pointer = &value;
        result += *pointer;
    }
    std::cout << "Sum: " << result << '\n';
}
