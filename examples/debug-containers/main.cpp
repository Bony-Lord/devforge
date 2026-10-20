#include <iostream>
#include <map>
#include <optional>
#include <string>
#include <vector>

struct Point {
    int x;
    double y;
};

int doubled(int value) {
    return value * 2;
}

int main() {
    Point point{7, 2.5};
    std::vector<int> values{3, 5, 8};
    std::string name = "C++ Studio";
    std::map<std::string, int> scores{{"Ada", 11}, {"Bjarne", 22}};
    std::optional<Point> maybe = point;

    // Breakpoint here: expand the objects above, then step into doubled().
    const int total = doubled(point.x) + values.back() + values.front() + values[1];
    std::cout << "Total: " << total << '\n';
}
