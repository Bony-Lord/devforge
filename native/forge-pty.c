/* MIT License. Copyright (c) 2026 GCC C++ Studio contributors.
 * A small PTY relay for GDB inferior I/O. It does not interpret commands.
 * stdout: first line is the slave terminal path; following bytes are terminal
 * output. stdin: raw user input, forwarded to the PTY master.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>
#include <signal.h>

static int write_all(int fd,const char *data,ssize_t n) {
    while(n>0) {ssize_t k=write(fd,data,(size_t)n);if(k<0){if(errno==EINTR)continue;return-1;}data+=k;n-=k;}return 0;
}
int main(void) {
    signal(SIGPIPE,SIG_IGN);
    int master=posix_openpt(O_RDWR|O_NOCTTY);
    if(master<0||grantpt(master)<0||unlockpt(master)<0){perror("PTY allocation");return 1;}
    char *name=ptsname(master);
    if(!name){perror("PTY name");return 2;}
    int slave=open(name,O_RDWR|O_NOCTTY);
    if(slave<0){perror("PTY slave");return 3;}
    struct termios t;
    if(tcgetattr(slave,&t)==0){t.c_lflag&=~ECHO;t.c_oflag&=~ONLCR;tcsetattr(slave,TCSANOW,&t);}
    printf("%s\n",name);fflush(stdout);
    struct pollfd fds[2]={{STDIN_FILENO,POLLIN,0},{master,POLLIN,0}};
    char buffer[8192];
    for(;;) {
        int rc=poll(fds,2,-1);if(rc<0){if(errno==EINTR)continue;break;}
        if(fds[0].revents&(POLLIN|POLLHUP)){
            ssize_t n=read(STDIN_FILENO,buffer,sizeof(buffer));if(n<=0)break;
            if(write_all(master,buffer,n)<0)break;
        }
        if(fds[1].revents&POLLIN){ssize_t n=read(master,buffer,sizeof(buffer));if(n>0&&write_all(STDOUT_FILENO,buffer,n)<0)break;}
        if(fds[1].revents&(POLLERR|POLLNVAL))break;
    }
    close(slave);close(master);return 0;
}
