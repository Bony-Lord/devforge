#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

// Deliberately broken examples. The default mode is safe.
int main(int argc, char **argv) {
    const std::string mode = argc > 1 ? argv[1] : "help";
    if (mode == "vector") {
        std::vector<int> values{1, 2, 3};
        return values[10]; // Debug library checks stop here.
    }
    if (mode == "use-after-free") {
        int *value = new int(42);
        delete value;
        std::cout << *value << '\n'; // Select Clang + ASan/UBSan.
    }
    if (mode == "division") {
        volatile int zero = 0;
        std::cout << 42 / zero << '\n'; // UBSan / SIGFPE.
    }
    if (mode == "exception") {
        throw std::runtime_error("Example of an uncaught exception");
    }
    if (mode == "signal") {
        volatile int *pointer = nullptr;
        *pointer = 42; // SIGSEGV; debugger keeps the stack and variables.
    }
    if (mode == "return139") {
        return 139; // An explicit return code is not diagnosed as a signal.
    }
    std::cout << "Arguments: vector | use-after-free | division | exception | signal | return139\n";
}
