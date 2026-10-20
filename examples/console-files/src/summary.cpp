#include "summary.hpp"

int sum(const std::vector<int>& values) {
    int result = 0;
    for (const auto& value : values) {
        result += value;
    }
    return result;
}
