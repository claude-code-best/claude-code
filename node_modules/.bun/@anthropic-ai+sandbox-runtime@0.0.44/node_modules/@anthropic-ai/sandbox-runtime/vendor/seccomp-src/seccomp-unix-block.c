/*
 * Seccomp BPF filter generator to block Unix domain socket creation
 *
 * This program generates a seccomp-bpf filter that blocks the socket() syscall
 * when called with AF_UNIX as the domain argument. This prevents creation of
 * Unix domain sockets while allowing all other socket types (AF_INET, AF_INET6, etc.)
 * and all other syscalls.
 *
 * The filter is exported in a format compatible with bubblewrap's --seccomp flag.
 *
 * SECURITY LIMITATION - 32-bit x86 (ia32):
 * TODO: This filter does NOT block socketcall() syscall, which is a security issue
 * on 32-bit x86 systems. On ia32, the socket() syscall doesn't exist - instead,
 * all socket operations are multiplexed through socketcall():
 *   - socketcall(SYS_SOCKET, [AF_UNIX, ...]) - can bypass this filter
 *   - socketcall(SYS_SOCKETPAIR, [AF_UNIX, ...]) - can bypass this filter
 *
 * To fix this, we need to add conditional rules that:
 * 1. Check if socketcall() exists on the current architecture (32-bit x86 only)
 * 2. Block socketcall(SYS_SOCKET, ...) when first arg of sub-call is AF_UNIX
 * 3. Block socketcall(SYS_SOCKETPAIR, ...) when first arg of sub-call is AF_UNIX
 *
 * This requires inspecting the arguments passed to socketcall, which is more
 * complex BPF logic. For now, 32-bit x86 is not supported.
 *
 * Compilation:
 *   gcc -o seccomp-unix-block seccomp-unix-block.c -lseccomp
 *
 * Usage:
 *   ./seccomp-unix-block <output-file>
 *
 * Dependencies:
 *   - libseccomp (libseccomp-dev package on Debian/Ubuntu)
 */

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <seccomp.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>

int main(int argc, char *argv[]) {
    scmp_filter_ctx ctx;
    int rc;

    if (argc != 2) {
        fprintf(stderr, "Usage: %s <output-file>\n", argv[0]);
        return 1;
    }

    const char *output_file = argv[1];

    /* Create seccomp context with default action ALLOW */
    ctx = seccomp_init(SCMP_ACT_ALLOW);
    if (ctx == NULL) {
        fprintf(stderr, "Error: Failed to initialize seccomp context\n");
        return 1;
    }

    /* Add rule to block socket(AF_UNIX, ...) */
    /* socket() syscall signature: int socket(int domain, int type, int protocol) */
    /* arg0 = domain (AF_UNIX = 1) */
    /* Use SCMP_CMP_MASKED_EQ with a 32-bit mask: the domain argument is a 32-bit
     * int, so the kernel ignores the upper 32 bits of the register. A plain
     * SCMP_CMP_EQ would compare all 64 bits and miss calls where the upper bits
     * are set. */
    rc = seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(socket), 1,
                          SCMP_A0(SCMP_CMP_MASKED_EQ, 0xffffffff, AF_UNIX));
    if (rc < 0) {
        fprintf(stderr, "Error: Failed to add seccomp rule: %s\n", strerror(-rc));
        seccomp_release(ctx);
        return 1;
    }

    /* Export the filter to a file */
    int fd = open(output_file, O_CREAT | O_WRONLY | O_TRUNC, 0600);
    if (fd < 0) {
        fprintf(stderr, "Error: Failed to open output file: %s\n", strerror(errno));
        seccomp_release(ctx);
        return 1;
    }

    rc = seccomp_export_bpf(ctx, fd);
    if (rc < 0) {
        fprintf(stderr, "Error: Failed to export seccomp filter: %s\n", strerror(-rc));
        close(fd);
        seccomp_release(ctx);
        return 1;
    }

    /* Clean up */
    close(fd);
    seccomp_release(ctx);

    return 0;
}
