/*
 * apply-seccomp.c - Apply seccomp BPF filter and exec command
 *
 * Usage: apply-seccomp <filter.bpf> <command> [args...]
 *
 * This program reads a pre-compiled BPF filter from a file, applies it
 * using prctl(PR_SET_SECCOMP), and then execs the specified command.
 *
 * The BPF filter must be in the format expected by SECCOMP_MODE_FILTER:
 * - struct sock_fprog { unsigned short len; struct sock_filter *filter; }
 * - Each filter instruction is 8 bytes (BPF instruction format)
 *
 * Compile: gcc -static -O2 -o apply-seccomp apply-seccomp.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/prctl.h>
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <errno.h>

#ifndef PR_SET_NO_NEW_PRIVS
#define PR_SET_NO_NEW_PRIVS 38
#endif

#ifndef SECCOMP_MODE_FILTER
#define SECCOMP_MODE_FILTER 2
#endif

#define MAX_FILTER_SIZE 4096  // Maximum BPF filter size in bytes

int main(int argc, char *argv[], char *envp[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <filter.bpf> <command> [args...]\n", argv[0]);
        return 1;
    }

    const char *filter_path = argv[1];
    char **command_argv = &argv[2];

    // Open and read BPF filter file
    int fd = open(filter_path, O_RDONLY);
    if (fd < 0) {
        perror("Failed to open BPF filter file");
        return 1;
    }

    // Read filter into memory
    unsigned char filter_bytes[MAX_FILTER_SIZE];
    ssize_t filter_size = read(fd, filter_bytes, MAX_FILTER_SIZE);
    close(fd);

    if (filter_size < 0) {
        perror("Failed to read BPF filter");
        return 1;
    }
    if (filter_size == 0) {
        fprintf(stderr, "BPF filter file is empty\n");
        return 1;
    }
    if (filter_size % 8 != 0) {
        fprintf(stderr, "Invalid BPF filter size: %zd (must be multiple of 8)\n", filter_size);
        return 1;
    }

    // Convert bytes to sock_filter instructions
    unsigned short filter_len = filter_size / 8;
    struct sock_filter *filter = (struct sock_filter *)filter_bytes;

    // Set up sock_fprog structure
    struct sock_fprog prog = {
        .len = filter_len,
        .filter = filter,
    };

    // Set NO_NEW_PRIVS to allow seccomp without CAP_SYS_ADMIN
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
        perror("prctl(PR_SET_NO_NEW_PRIVS) failed");
        return 1;
    }

    // Apply seccomp filter
    if (prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog) != 0) {
        perror("prctl(PR_SET_SECCOMP) failed");
        return 1;
    }

    // Exec the command with seccomp filter active
    execvp(command_argv[0], command_argv);

    // If we get here, exec failed
    perror("execvp failed");
    return 1;
}
