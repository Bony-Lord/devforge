#pragma once
#include <numeric>
#include <vector>

inline int sum(const std::vector<int>& values) {
    return std::accumulate(values.begin(), values.end(), 0);
}
