/* C++ Studio native program host, MIT. Run in a separate OS process.
 * Tools are installed by Android's package manager; user output is a shared
 * object loaded read-only with dlopen. No writable executable is execve'd.
 */
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/prctl.h>

static volatile sig_atomic_t child_pid;
static volatile sig_atomic_t cancelled;

static void forward_signal(int signal) {
    cancelled = signal;
    if (child_pid > 0) kill(-child_pid, signal);
}

static void execute(int argc, char **argv) {
    /* Constructors may write output. Keep ordinary console buffering rules. */
    void *program = dlopen(argv[0], RTLD_NOW | RTLD_GLOBAL);
    if (!program) {
        fprintf(stderr, "Cannot load program: %s\n", dlerror());
        exit(126);
    }
    dlerror();
    int (*entry)(int, char **) = (int (*)(int, char **))dlsym(program, "main");
    const char *error = dlerror();
    if (error || !entry) {
        fprintf(stderr, "Program has no exported main: %s\n", error ? error : "missing symbol");
        exit(127);
    }
    /* Both standard main forms use this platform ABI; extra argument registers
     * are ignored by int main(). argv[0] remains the user's program path. */
    int code = entry(argc, argv);
    /* exit runs C/C++ atexit handlers while the image is still mapped. */
    exit(code);
}

int main(int argc, char **argv) {
    int direct = argc > 1 && strcmp(argv[1], "--direct") == 0;
    int command = argc > 1 && strcmp(argv[1], "--command") == 0;
    int offset = direct || command ? 2 : 1;
    if (argc <= offset) {
        fputs("Usage: studio-runner [--direct] PROGRAM [ARG ...]\n", stderr);
        return 64;
    }
    /* GDB follows the actual user process, without a monitor fork. */
    if (direct) execute(argc - offset, argv + offset);
    sigset_t blocked, previous;
    sigemptyset(&blocked);
    sigaddset(&blocked, SIGTERM); sigaddset(&blocked, SIGINT); sigaddset(&blocked, SIGHUP);
    sigprocmask(SIG_BLOCK, &blocked, &previous);
    struct sigaction action = {0};
    action.sa_handler = forward_signal;
    sigemptyset(&action.sa_mask);
    sigaction(SIGTERM, &action, NULL); sigaction(SIGINT, &action, NULL); sigaction(SIGHUP, &action, NULL);
    pid_t parent = getpid(), child = fork();
    if (child < 0) { perror("Cannot start program"); return 125; }
    if (child == 0) {
        setpgid(0, 0);
        prctl(PR_SET_PDEATHSIG, SIGKILL);
        if (getppid() != parent) _exit(125);
        signal(SIGTERM, SIG_DFL); signal(SIGINT, SIG_DFL); signal(SIGHUP, SIG_DFL);
        sigprocmask(SIG_SETMASK, &previous, NULL);
        if (command) { execvp(argv[offset], argv + offset); perror("Cannot start tool"); _exit(126); }
        execute(argc - offset, argv + offset);
    }
    child_pid = child;
    setpgid(child, child);
    sigprocmask(SIG_SETMASK, &previous, NULL);
    int status;
    while (waitpid(child, &status, 0) < 0) {
        if (errno != EINTR) { perror("Cannot wait for program"); return 125; }
        /* Stop also reaps descendants that ignore SIGTERM. */
        if (cancelled) kill(-child, SIGKILL);
    }
    /* An IDE command must not leave children behind after completion. */
    kill(-child, SIGKILL);
    if (cancelled) { kill(-child, SIGKILL); return 128 + cancelled; }
    if (WIFSIGNALED(status)) {
        int signal = WTERMSIG(status);
        /* A structured record distinguishes an actual signal from return 139.
         * Written by the parent; no unsafe unwinding inside a signal handler. */
        fprintf(stderr, "\n\036CPPSTUDIO_FAULT:{\"kind\":\"signal\",\"signal\":%d}\n", signal);
        return 128 + signal;
    }
    return WIFEXITED(status) ? WEXITSTATUS(status) : 125;
}
